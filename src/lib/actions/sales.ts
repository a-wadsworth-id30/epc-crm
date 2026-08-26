"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, type CurrentUser } from "@/lib/auth";
import {
  companyIdAccessWhere,
  companyWhereWithAccess,
  contactIdAccessWhere,
  contactWhereWithAccess,
  salesOpportunityIdAccessWhere,
  salesOpportunityWhereWithAccess,
} from "@/lib/crm-resource-access";
import { appBaseUrlFromHeaders } from "@/lib/http/origin";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import {
  manualPipedriveLeadEmailMaxPages,
  syncPipedriveLeadEmailsForOpportunity,
  syncPipedriveLeadFilesForOpportunity,
  syncPipedriveLeadNotesForOpportunity,
} from "@/lib/integrations/pipedrive-import";
import { sendSalesOpportunityToSpruce } from "@/lib/integrations/spruce-zapier-outbound";
import { revalidateHeaderNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";
import { getCrmSettings } from "@/lib/settings";
import {
  inferLeadScopeFromText,
  leadScopeProductTypes,
  leadScopeToJson,
  mergeLeadScope,
  normaliseLeadScope,
  type LeadScope,
} from "@/lib/sales/lead-scope";
import { isLeadSourceValue } from "@/lib/sales/lead-sources";
import {
  parseSalesDefaults,
  resolveSalesDefaultOwnerId,
} from "@/lib/sales/defaults";
import {
  extractSaleNoteMentionTokens,
  resolveSaleNoteMentions,
  type SaleNoteMentionUser,
} from "@/lib/sales/note-mentions";
import { sendSaleNoteMentionEmail } from "@/lib/sales/note-mention-email";
import { validateSaleOwnerAssignment } from "@/lib/sales/owner-assignment";
import {
  isSalesStage,
  lifecycleOpportunityDataForDefaultStage,
  lifecycleOpportunityDataForPipelineStage,
  recordSalesOpportunityCreated,
  recordSalesStageChange,
  salesPipelineStageForId,
  salesStages,
  type SalesStageValue,
} from "@/lib/sales/lifecycle";
import { runSalesAutomationTrigger } from "@/lib/sales/automation";
import { evaluateStageGate } from "@/lib/sales/stage-gates";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";

export type SalesActionState = {
  ok: boolean;
  message: string;
  saleId?: string;
};

export type LeadScopeActionState = {
  ok: boolean;
  message: string;
  scope?: LeadScope;
};

export type DiscoveryAnswersActionState = {
  ok: boolean;
  message: string;
};

export type SalesNoteActionState = {
  ok: boolean;
  message: string;
};

const pipedriveSaleViewFileSyncThrottleMs = 30_000;
const pipedriveSaleViewEmailSyncThrottleMs = 30_000;
const pipedriveSaleViewNoteSyncThrottleMs = 30_000;

function salesPipedriveWarningMessage(warnings: string[]) {
  if (!warnings.length) return "";

  const firstWarning = warnings[0]?.trim();
  const detail = firstWarning
    ? ` First warning: ${firstWarning.slice(0, 240)}`
    : "";

  return ` ${warnings.length} warning${warnings.length === 1 ? "" : "s"} recorded.${detail}`;
}

const saleSchema = z.object({
  title: z.string().trim().min(2, "Sale name is required."),
  stage: z.enum(salesStages).default("LEAD"),
  salesPipelineStageId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  valuePounds: z.string().trim().optional(),
  source: z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z
      .string()
      .trim()
      .min(1, "Choose a lead source.")
      .refine(isLeadSourceValue, "Choose a lead source."),
  ),
  contactId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  nextStep: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  ownerId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value !== "unassigned" ? value : null)),
  expectedCloseDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
});

const salesNoteSchema = z.object({
  saleId: z.string().trim().min(1, "Sale is required."),
  body: z
    .string()
    .trim()
    .min(1, "Write a note before saving.")
    .max(4000, "Keep notes under 4,000 characters."),
});

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function saleNoteMentionTaskTitle(saleTitle: string) {
  return truncateText(`Review note on ${saleTitle}`, 180);
}

function saleNoteMentionTaskDescription({
  body,
  mentionedBy,
}: {
  body: string;
  mentionedBy: string;
}) {
  return truncateText(
    `You were mentioned by ${mentionedBy} in a sales note.\n\n${body}`,
    2000,
  );
}

function formatMentionTokens(tokens: string[]) {
  const formatted = tokens.slice(0, 3).map((token) => `@${token}`);

  if (tokens.length > formatted.length) {
    formatted.push(`${tokens.length - formatted.length} more`);
  }

  return formatted.join(", ");
}

async function sendSaleNoteMentionEmailAlerts({
  body,
  mentionedByName,
  mentions,
  saleId,
  saleTitle,
}: {
  body: string;
  mentionedByName: string;
  mentions: Array<{ tokens: string[]; user: SaleNoteMentionUser }>;
  saleId: string;
  saleTitle: string;
}) {
  let sent = 0;
  let failed = 0;

  for (const mention of mentions) {
    try {
      await sendSaleNoteMentionEmail({
        mentionedByName,
        noteBody: body,
        recipient: mention.user,
        saleId,
        saleTitle,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Sale note mention email failed", {
        error,
        saleId,
        userId: mention.user.id,
      });
    }
  }

  return { failed, sent };
}

const inlineSaleContactSchema = z.object({
  contactMode: z.enum(["existing", "new"]).default("existing"),
  requireLinkedContact: z.boolean(),
  newContactFirstName: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  newContactLastName: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  newContactEmail: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(z.string().email().nullable()),
  newContactPhone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  newContactRole: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  newContactCompanyId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  newContactCompanyName: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
});

const aiFeedbackSchema = z.object({
  saleId: z.string().trim().min(1),
  outcome: z.enum(["accepted", "dismissed"]),
  recommendationAction: z.string().trim().max(80).optional(),
  recommendationType: z.string().trim().max(80).default("stage-guidance"),
  rationale: z.string().trim().max(1000).optional(),
  targetStage: z.string().trim().max(160).optional(),
  targetStageId: z.string().trim().optional(),
});

const sendSaleToSpruceSchema = z.object({
  saleId: z.string().trim().min(1, "Sale ID is required."),
});

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

class SalesActionError extends Error {}

const salesOpportunityExternalLinkTypes = [
  "salesOpportunity",
  "SalesOpportunity",
] as const;
const deletedSalesOpportunityExternalLinkType = "salesOpportunityDeleted";
const protectedSalesEntityType = "SalesOpportunity";

function parseInlineSaleContact(formData: FormData) {
  const rawContactMode = formValue(formData, "contactMode");

  return inlineSaleContactSchema.safeParse({
    contactMode: rawContactMode === "new" ? "new" : "existing",
    requireLinkedContact: formValue(formData, "requireLinkedContact") === "on",
    newContactFirstName: formValue(formData, "newContactFirstName"),
    newContactLastName: formValue(formData, "newContactLastName"),
    newContactEmail: formValue(formData, "newContactEmail"),
    newContactPhone: formValue(formData, "newContactPhone"),
    newContactRole: formValue(formData, "newContactRole"),
    newContactCompanyId: formValue(formData, "newContactCompanyId"),
    newContactCompanyName: formValue(formData, "newContactCompanyName"),
  });
}

async function resolveInlineSaleContactCompany({
  companiesEnabled,
  companyId,
  companyName,
  tx,
  user,
}: {
  companiesEnabled: boolean;
  companyId: string | null;
  companyName: string | null;
  tx: Prisma.TransactionClient;
  user: CurrentUser;
}) {
  if (!companiesEnabled) {
    return { companyId: null, companyName };
  }

  if (companyId) {
    const company = await tx.company.findFirst({
      where: companyIdAccessWhere(companyId, user),
      select: { id: true, name: true },
    });

    if (!company) {
      throw new SalesActionError("Selected organisation could not be found.");
    }

    return { companyId: company.id, companyName: company.name };
  }

  if (!companyName) {
    return { companyId: null, companyName: null };
  }

  const existingCompany = await tx.company.findFirst({
    where: companyWhereWithAccess(user, {
      name: { equals: companyName, mode: "insensitive" },
    }),
    select: { id: true, name: true },
  });

  if (existingCompany) {
    return { companyId: existingCompany.id, companyName: existingCompany.name };
  }

  const company = await tx.company.create({
    data: {
      createdByUserId: user.id,
      name: companyName,
      status: "Prospect",
    },
    select: { id: true, name: true },
  });

  return { companyId: company.id, companyName: company.name };
}

async function assertNoInlineContactDuplicate({
  email,
  phoneNormalized,
  tx,
  user,
}: {
  email: string | null;
  phoneNormalized: string | null;
  tx: Prisma.TransactionClient;
  user: CurrentUser;
}) {
  const duplicateFilters: Prisma.ContactWhereInput[] = [];

  if (email) {
    duplicateFilters.push(
      { email: { equals: email, mode: "insensitive" } },
      { additionalEmails: { some: { email: { equals: email, mode: "insensitive" } } } },
    );
  }

  if (phoneNormalized) {
    duplicateFilters.push(
      { phoneNormalized },
      { additionalPhones: { some: { phoneNormalized } } },
    );
  }

  if (!duplicateFilters.length) return;

  const duplicate = await tx.contact.findFirst({
    where: contactWhereWithAccess(user, { OR: duplicateFilters }),
    select: { firstName: true, id: true, lastName: true },
  });

  if (!duplicate) return;

  throw new SalesActionError(
    `A contact already exists for those details: ${`${duplicate.firstName} ${duplicate.lastName}`.trim()}. Search and select that contact instead.`,
  );
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecentTimestamp(
  value: string | null,
  now: Date,
  thresholdMs: number,
) {
  if (!value) return false;

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;

  return now.getTime() - timestamp < thresholdMs;
}

function parseValueCents(value: string | undefined) {
  if (!value) return 0;

  const pounds = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(pounds) || pounds < 0) return null;

  return Math.round(pounds * 100);
}

function parseDate(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function splitCustomProducts(value: string | undefined) {
  return (value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function isMultiAnswer({
  answerMode,
  answerType,
}: {
  answerMode: string;
  answerType: string;
}) {
  return (
    answerMode === "MULTIPLE_MAX" ||
    answerMode === "MULTIPLE_UNLIMITED" ||
    answerType === "MULTI_SELECT" ||
    answerType === "PRODUCT_MULTI_SELECT" ||
    answerType === "CATEGORY_MULTI_SELECT"
  );
}

function discoveryAnswerValue({
  answerMode,
  answerType,
  rawValue,
}: {
  answerMode: string;
  answerType: string;
  rawValue: string | string[];
}) {
  if (isMultiAnswer({ answerMode, answerType })) {
    const values = (Array.isArray(rawValue) ? rawValue : [rawValue])
      .map((value) => value.trim())
      .filter(Boolean);

    return values.length ? Array.from(new Set(values)) : null;
  }

  const value =
    (Array.isArray(rawValue) ? rawValue[0] : rawValue)?.trim() ?? "";
  if (!value) return null;

  if (answerType === "BOOLEAN") return value === "true";
  if (answerType === "NUMBER" || answerType === "CURRENCY" || answerType === "SLIDER") {
    const numericValue = Number(value.replace(/,/g, ""));
    return Number.isFinite(numericValue) ? numericValue : value;
  }

  return value;
}

function checkedProductTypes(formData: FormData) {
  const selected = formData
    .getAll("productTypes")
    .map((value) => String(value))
    .filter((value) =>
      leadScopeProductTypes.some(
        (productType) => productType.toLowerCase() === value.toLowerCase(),
      ),
    );

  return Array.from(new Set(selected)) as LeadScope["productTypes"];
}

async function activeOwnerIdSet(ownerId: string | null) {
  if (!ownerId) {
    return new Set<string>();
  }

  const owner = await prisma.user.findFirst({
    where: { id: ownerId, status: "ACTIVE" },
    select: { id: true },
  });

  return new Set(owner ? [owner.id] : []);
}

export async function createSaleAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const [user, settings] = await Promise.all([requireUser(), getCrmSettings()]);
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const submittedOwnerId = formValue(formData, "ownerId");
  const parsed = saleSchema.safeParse({
    title: formValue(formData, "title"),
    stage: formValue(formData, "stage"),
    salesPipelineStageId: formValue(formData, "salesPipelineStageId"),
    valuePounds: formValue(formData, "valuePounds"),
    source: formValue(formData, "source"),
    contactId: formValue(formData, "contactId"),
    nextStep: formValue(formData, "nextStep"),
    ownerId: submittedOwnerId,
    expectedCloseDate: formValue(formData, "expectedCloseDate"),
  });
  const parsedInlineContact = parseInlineSaleContact(formData);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the sale details.",
    };
  }

  if (!parsedInlineContact.success) {
    return {
      ok: false,
      message:
        parsedInlineContact.error.issues[0]?.message ??
        "Check the contact details.",
    };
  }

  const valueCents = parseValueCents(parsed.data.valuePounds);
  if (valueCents === null) {
    return { ok: false, message: "Value must be a positive number." };
  }

  const inlineContact = parsedInlineContact.data;
  const contactId =
    inlineContact.contactMode === "new" ? null : parsed.data.contactId;

  if (
    inlineContact.requireLinkedContact &&
    inlineContact.contactMode !== "new" &&
    !contactId
  ) {
    return {
      ok: false,
      message: "Search for an existing contact or create a new one.",
    };
  }

  if (inlineContact.contactMode === "new") {
    if (!inlineContact.newContactFirstName) {
      return { ok: false, message: "First name is required for the new contact." };
    }
    if (!inlineContact.newContactLastName) {
      return { ok: false, message: "Last name is required for the new contact." };
    }
  }

  const selectedPipelineStageId =
    parsed.data.salesPipelineStageId ??
    salesDefaults.defaultSalesPipelineStageId;

  if (
    selectedPipelineStageId &&
    !(await salesPipelineStageForId(prisma, selectedPipelineStageId))
  ) {
    return { ok: false, message: "Choose an active pipeline stage." };
  }

  const linkedContact = contactId
    ? await prisma.contact.findFirst({
        where: contactIdAccessWhere(contactId, user),
        select: { companyId: true, id: true },
      })
    : null;

  if (contactId && !linkedContact) {
    return { ok: false, message: "The selected contact was not found." };
  }

  const occurredAt = new Date();
  const defaultOwnerId =
    user.role === "ADMIN"
      ? resolveSalesDefaultOwnerId({
          fallbackUserId: user.id,
          salesDefaults,
        })
      : user.id;
  const requestedOwnerId =
    submittedOwnerId === "unassigned"
      ? null
      : (parsed.data.ownerId ?? defaultOwnerId);
  const ownerAssignment = validateSaleOwnerAssignment({
    activeOwnerIds: await activeOwnerIdSet(requestedOwnerId),
    currentUser: user,
    ownerId: requestedOwnerId,
  });

  if (!ownerAssignment.ok) {
    return { ok: false, message: ownerAssignment.message };
  }

  let createdContactId: string | null = null;
  let linkedCompanyIdForRevalidation = linkedContact?.companyId ?? null;
  let sale: { id: string };

  try {
    sale = await prisma.$transaction(async (tx) => {
      let contactForSale = linkedContact;
      let linkedCompanyId = linkedContact?.companyId ?? null;

      if (!contactForSale && inlineContact.contactMode === "new") {
        const phoneNormalized = normalizedContactPhone(
          inlineContact.newContactPhone,
        );

        await assertNoInlineContactDuplicate({
          email: inlineContact.newContactEmail,
          phoneNormalized,
          tx,
          user,
        });

        const companyData = await resolveInlineSaleContactCompany({
          companiesEnabled: settings.companiesEnabled,
          companyId: inlineContact.newContactCompanyId,
          companyName: inlineContact.newContactCompanyName,
          tx,
          user,
        });
        const contact = await tx.contact.create({
          data: {
            companyId: companyData.companyId,
            companyName: companyData.companyName,
            createdByUserId: user.id,
            email: inlineContact.newContactEmail,
            firstName: inlineContact.newContactFirstName ?? "",
            lastName: inlineContact.newContactLastName ?? "",
            leadSource: parsed.data.source,
            phone: inlineContact.newContactPhone,
            phoneNormalized,
            role: inlineContact.newContactRole,
          },
          select: { companyId: true, id: true },
        });

        contactForSale = contact;
        linkedCompanyId = companyData.companyId;
        createdContactId = contact.id;
        linkedCompanyIdForRevalidation = companyData.companyId;
      }

      if (inlineContact.requireLinkedContact && !contactForSale) {
        throw new SalesActionError(
          "Search for an existing contact or create a new one.",
        );
      }

      const lifecycleData = await lifecycleOpportunityDataForPipelineStage(
        tx,
        selectedPipelineStageId,
        parsed.data.stage,
        occurredAt,
      );
      const createdSale = await tx.salesOpportunity.create({
        data: {
          title: parsed.data.title,
          ...lifecycleData,
          valueCents,
          currency: workspaceDefaults.currency,
          source: parsed.data.source,
          nextStep: parsed.data.nextStep,
          expectedCloseDate: parseDate(parsed.data.expectedCloseDate),
          ownerId: ownerAssignment.ownerId,
          contactId: contactForSale?.id,
          companyId: linkedCompanyId,
        },
        select: { id: true },
      });

      await recordSalesOpportunityCreated(tx, {
        opportunityId: createdSale.id,
        occurredAt,
        salesPipelineStageId: lifecycleData.salesPipelineStageId,
        source: "manual-sale-form",
        stage: lifecycleData.stage,
        userId: user.id,
      });

      return createdSale;
    });
  } catch (error) {
    if (error instanceof SalesActionError) {
      return { ok: false, message: error.message };
    }

    throw error;
  }

  revalidatePath("/sales");
  if (linkedContact) {
    revalidatePath(`/contacts/${linkedContact.id}`);
  }
  if (createdContactId) {
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${createdContactId}`);
  }
  if (linkedCompanyIdForRevalidation) {
    revalidatePath("/clients");
    revalidatePath(`/clients/${linkedCompanyIdForRevalidation}`);
  }
  return { ok: true, message: "Sale added.", saleId: sale.id };
}

export async function bulkUpdateSalesAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();

  const ids = String(formData.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const uniqueIds = Array.from(new Set(ids));
  const bulkAction = String(formData.get("bulkAction") ?? "");

  if (!uniqueIds.length) {
    return { ok: false, message: "Select at least one sale." };
  }

  if (bulkAction === "delete-crm") {
    if (user.role !== "ADMIN") {
      return {
        ok: false,
        message: "Only admins can delete sales records.",
      };
    }

    if (String(formData.get("confirmDelete") ?? "") !== "crm-only") {
      return {
        ok: false,
        message: "Confirm this is a CRM-only delete.",
      };
    }

    const opportunities = await prisma.salesOpportunity.findMany({
      where: salesOpportunityWhereWithAccess(user, { id: { in: uniqueIds } }),
      select: { companyId: true, contactId: true, id: true },
    });

    if (opportunities.length !== uniqueIds.length) {
      return {
        ok: false,
        message: "Some selected sales were not found or are not available to you.",
      };
    }

    const opportunityIds = opportunities.map((opportunity) => opportunity.id);
    const protectedEntityWhere = {
      entityId: { in: opportunityIds },
      entityType: protectedSalesEntityType,
    };
    const [
      fileAssetCount,
      uploadRequestCount,
      documentShareCount,
      documentPortalCount,
      signatureRequestCount,
      conversionUploadCount,
      openTaskCount,
    ] = await Promise.all([
      prisma.fileAsset.count({ where: protectedEntityWhere }),
      prisma.customerUploadRequest.count({ where: protectedEntityWhere }),
      prisma.customerDocumentShare.count({ where: protectedEntityWhere }),
      prisma.customerDocumentPortal.count({ where: protectedEntityWhere }),
      prisma.signatureRequest.count({ where: protectedEntityWhere }),
      prisma.marketingConversionUpload.count({ where: protectedEntityWhere }),
      prisma.task.count({
        where: {
          OR: opportunityIds.map((id) => ({
            metadata: { equals: id, path: ["opportunityId"] },
          })),
          status: { not: "DONE" },
        },
      }),
    ]);
    const protectedRecordCount =
      fileAssetCount +
      uploadRequestCount +
      documentShareCount +
      documentPortalCount +
      signatureRequestCount +
      conversionUploadCount +
      openTaskCount;

    if (protectedRecordCount > 0) {
      return {
        ok: false,
        message:
          "Selected sales have linked CRM documents, customer links, signature requests, marketing uploads or open tasks. Remove those links before deleting.",
      };
    }

    const pipedriveLeadLinks = await prisma.externalRecordLink.findMany({
      where: {
        externalType: "lead",
        internalId: { in: opportunityIds },
        internalType: { in: [...salesOpportunityExternalLinkTypes] },
        provider: "pipedrive",
      },
      select: {
        id: true,
        internalId: true,
        internalType: true,
        metadata: true,
      },
    });
    const tombstonedLinkIds = pipedriveLeadLinks.map((link) => link.id);
    const deletedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      for (const link of pipedriveLeadLinks) {
        await tx.externalRecordLink.update({
          where: { id: link.id },
          data: {
            internalType: deletedSalesOpportunityExternalLinkType,
            lastSeenAt: deletedAt,
            metadata: {
              ...jsonObject(link.metadata),
              deletedFromCrm: true,
              deletedFromCrmAt: deletedAt.toISOString(),
              deletedFromCrmByUserId: user.id,
              deletedInternalId: link.internalId,
              deletedInternalType: link.internalType,
            },
          },
        });
      }

      await tx.externalRecordLink.deleteMany({
        where: {
          ...(tombstonedLinkIds.length
            ? { id: { notIn: tombstonedLinkIds } }
            : {}),
          internalId: { in: opportunityIds },
          internalType: { in: [...salesOpportunityExternalLinkTypes] },
        },
      });

      await tx.attributionRecord.updateMany({
        where: { opportunityId: { in: opportunityIds } },
        data: { opportunityId: null },
      });

      return tx.salesOpportunity.deleteMany({
        where: salesOpportunityWhereWithAccess(user, { id: { in: opportunityIds } }),
      });
    });

    revalidatePath("/sales");
    revalidatePath("/marketing");
    revalidatePath("/tasks");
    revalidateHeaderNotifications();
    const linkedContactIds = new Set(
      opportunities
        .map((opportunity) => opportunity.contactId)
        .filter((id): id is string => Boolean(id)),
    );
    const linkedCompanyIds = new Set(
      opportunities
        .map((opportunity) => opportunity.companyId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const contactId of linkedContactIds) {
      revalidatePath(`/contacts/${contactId}`);
    }
    for (const companyId of linkedCompanyIds) {
      revalidatePath(`/clients/${companyId}`);
    }

    return {
      ok: true,
      message: `Deleted ${result.count} CRM sale${result.count === 1 ? "" : "s"}. Pipedrive was not changed.`,
    };
  }

  if (bulkAction === "stage") {
    const stage = String(formData.get("stage") ?? "");
    const salesPipelineStageId = String(
      formData.get("salesPipelineStageId") ?? "",
    ).trim();
    if (!salesPipelineStageId && !isSalesStage(stage)) {
      return { ok: false, message: "Choose a valid stage." };
    }
    const fallbackStage = isSalesStage(stage) ? stage : "LEAD";

    if (
      salesPipelineStageId &&
      !(await salesPipelineStageForId(prisma, salesPipelineStageId))
    ) {
      return { ok: false, message: "Choose an active pipeline stage." };
    }

    const opportunities = await prisma.salesOpportunity.findMany({
      where: salesOpportunityWhereWithAccess(user, { id: { in: uniqueIds } }),
      select: { id: true, salesPipelineStageId: true, stage: true },
    });

    if (opportunities.length !== uniqueIds.length) {
      return {
        ok: false,
        message: "Some selected sales were not found or are not available to you.",
      };
    }

    const occurredAt = new Date();
    let updatedCount = 0;
    let gateWarningCount = 0;

    try {
      await prisma.$transaction(async (tx) => {
        const lifecycleData = salesPipelineStageId
          ? await lifecycleOpportunityDataForPipelineStage(
              tx,
              salesPipelineStageId,
              fallbackStage,
              occurredAt,
            )
          : await lifecycleOpportunityDataForDefaultStage(
              tx,
              fallbackStage,
              occurredAt,
            );
        const changedOpportunities = opportunities.filter(
          (opportunity) =>
            opportunity.stage !== lifecycleData.stage ||
            opportunity.salesPipelineStageId !==
              lifecycleData.salesPipelineStageId,
        );

        updatedCount = changedOpportunities.length;
        const gateFailures: string[] = [];
        const gateWarnings: string[] = [];

        for (const opportunity of changedOpportunities) {
          const gate = await evaluateStageGate({
            client: tx,
            opportunityId: opportunity.id,
            salesPipelineStageId: lifecycleData.salesPipelineStageId,
          });

          if (!gate.missing.length) continue;

          const missingLabels = gate.missing
            .slice(0, 3)
            .map((question) => question.label)
            .join(", ");
          const message = `${opportunity.id}: missing ${missingLabels}${gate.missing.length > 3 ? "..." : ""}`;

          if (gate.mode === "BLOCK") {
            gateFailures.push(message);
          } else if (gate.mode === "WARN") {
            gateWarnings.push(message);
          }
        }

        if (gateFailures.length) {
          throw new Error(
            `Required stage data is missing. ${gateFailures.slice(0, 3).join(" / ")}`,
          );
        }
        gateWarningCount = gateWarnings.length;

        for (const opportunity of changedOpportunities) {
          await tx.salesOpportunity.update({
            where: { id: opportunity.id },
            data: lifecycleData,
          });

          await recordSalesStageChange(tx, {
            opportunityId: opportunity.id,
            fromStage: opportunity.stage as SalesStageValue,
            fromPipelineStageId: opportunity.salesPipelineStageId,
            toStage: lifecycleData.stage,
            toPipelineStageId: lifecycleData.salesPipelineStageId,
            occurredAt,
            source: "sales-bulk-action",
            userId: user.id,
          });

          await runSalesAutomationTrigger(tx, {
            opportunityId: opportunity.id,
            salesPipelineStageId: lifecycleData.salesPipelineStageId,
            trigger: "STAGE_ENTERED",
            userId: user.id,
            metadata: {
              source: "sales-bulk-action",
              fromPipelineStageId: opportunity.salesPipelineStageId,
              toPipelineStageId: lifecycleData.salesPipelineStageId,
            },
          });
        }
      });
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Stage movement was blocked by required-data gates.",
      };
    }

    revalidatePath("/sales");
    return {
      ok: true,
      message: `Updated ${updatedCount} sale${updatedCount === 1 ? "" : "s"}.${gateWarningCount ? ` ${gateWarningCount} moved with required-data warnings.` : ""}`,
    };
  }

  if (bulkAction === "owner") {
    const ownerId = String(formData.get("ownerId") ?? "");
    const requestedOwnerId = ownerId && ownerId !== "unassigned" ? ownerId : null;
    const ownerAssignment = validateSaleOwnerAssignment({
      activeOwnerIds: await activeOwnerIdSet(requestedOwnerId),
      currentUser: user,
      ownerId: requestedOwnerId,
    });

    if (!ownerAssignment.ok) {
      return { ok: false, message: ownerAssignment.message };
    }

    const accessibleSelectionCount = await prisma.salesOpportunity.count({
      where: salesOpportunityWhereWithAccess(user, { id: { in: uniqueIds } }),
    });

    if (accessibleSelectionCount !== uniqueIds.length) {
      return {
        ok: false,
        message: "Some selected sales were not found or are not available to you.",
      };
    }

    const result = await prisma.salesOpportunity.updateMany({
      where: salesOpportunityWhereWithAccess(user, { id: { in: uniqueIds } }),
      data: { ownerId: ownerAssignment.ownerId },
    });

    revalidatePath("/sales");
    return {
      ok: true,
      message: `Updated ${result.count} sale${result.count === 1 ? "" : "s"}.`,
    };
  }

  return { ok: false, message: "Choose a bulk action." };
}

type SaleStageMoveSource =
  | "sale-detail-stage-control"
  | "sales-kanban-drag";

async function moveSaleToPipelineStage({
  saleId,
  salesPipelineStageId,
  source,
  user,
}: {
  saleId: string;
  salesPipelineStageId: string;
  source: SaleStageMoveSource;
  user: CurrentUser;
}): Promise<SalesActionState> {
  if (!saleId || !salesPipelineStageId) {
    return { ok: false, message: "Choose a valid stage." };
  }

  if (!(await salesPipelineStageForId(prisma, salesPipelineStageId))) {
    return { ok: false, message: "Choose an active pipeline stage." };
  }

  const sale = await prisma.salesOpportunity.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      ownerId: true,
      salesPipelineStageId: true,
      stage: true,
    },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  if (user.role !== "ADMIN" && sale.ownerId && sale.ownerId !== user.id) {
    return {
      ok: false,
      message: "You cannot move a sale owned by another user.",
    };
  }

  const occurredAt = new Date();
  let gateWarningCount = 0;
  let moved = false;

  try {
    await prisma.$transaction(async (tx) => {
      const lifecycleData = await lifecycleOpportunityDataForPipelineStage(
        tx,
        salesPipelineStageId,
        sale.stage as SalesStageValue,
        occurredAt,
      );

      if (
        sale.stage === lifecycleData.stage &&
        sale.salesPipelineStageId === lifecycleData.salesPipelineStageId
      ) {
        return;
      }

      const gate = await evaluateStageGate({
        client: tx,
        opportunityId: sale.id,
        salesPipelineStageId: lifecycleData.salesPipelineStageId,
      });

      if (gate.missing.length) {
        const missingLabels = gate.missing
          .slice(0, 4)
          .map((question) => question.label)
          .join(", ");

        if (gate.mode === "BLOCK") {
          throw new Error(`Required stage data is missing: ${missingLabels}`);
        }

        if (gate.mode === "WARN") {
          gateWarningCount = gate.missing.length;
        }
      }

      await tx.salesOpportunity.update({
        where: { id: sale.id },
        data: lifecycleData,
      });
      moved = true;

      await recordSalesStageChange(tx, {
        opportunityId: sale.id,
        fromStage: sale.stage as SalesStageValue,
        fromPipelineStageId: sale.salesPipelineStageId,
        toStage: lifecycleData.stage,
        toPipelineStageId: lifecycleData.salesPipelineStageId,
        occurredAt,
        source,
        userId: user.id,
      });

      await runSalesAutomationTrigger(tx, {
        opportunityId: sale.id,
        salesPipelineStageId: lifecycleData.salesPipelineStageId,
        trigger: "STAGE_ENTERED",
        userId: user.id,
        metadata: {
          source,
          fromPipelineStageId: sale.salesPipelineStageId,
          toPipelineStageId: lifecycleData.salesPipelineStageId,
        },
      });
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Stage movement was blocked by required-data gates.",
    };
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  return {
    ok: true,
    message: !moved
      ? "Stage already matched."
      : gateWarningCount
      ? `Stage updated with ${gateWarningCount} required-data warning${gateWarningCount === 1 ? "" : "s"}.`
      : "Stage updated.",
  };
}

export async function updateSaleStageAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();

  return moveSaleToPipelineStage({
    saleId: String(formData.get("saleId") ?? "").trim(),
    salesPipelineStageId: String(
      formData.get("salesPipelineStageId") ?? "",
    ).trim(),
    source: "sale-detail-stage-control",
    user,
  });
}

export async function moveSaleStageFromKanbanAction(
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();

  return moveSaleToPipelineStage({
    saleId: String(formData.get("saleId") ?? "").trim(),
    salesPipelineStageId: String(
      formData.get("salesPipelineStageId") ?? "",
    ).trim(),
    source: "sales-kanban-drag",
    user,
  });
}

export async function approveSaleStageSuggestionAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();
  const runId = String(formData.get("runId") ?? "").trim();

  if (!runId) {
    return { ok: false, message: "Stage suggestion not found." };
  }

  const run = await prisma.salesAutomationRun.findUnique({
    where: { id: runId },
    include: {
      opportunity: {
        select: {
          id: true,
          ownerId: true,
          salesPipelineStageId: true,
          stage: true,
        },
      },
    },
  });

  if (!run?.opportunity || run.action !== "SUGGEST_STAGE_MOVE") {
    return { ok: false, message: "Stage suggestion not found." };
  }

  const opportunity = run.opportunity;
  const metadata = jsonObject(run.metadata);
  if (stringValue(metadata.stageMoveAppliedAt)) {
    return { ok: false, message: "This stage suggestion was already applied." };
  }

  const salesPipelineStageId = stringValue(metadata.suggestedStageId);
  if (!salesPipelineStageId) {
    return { ok: false, message: "This suggestion has no target stage." };
  }

  if (
    user.role !== "ADMIN" &&
    opportunity.ownerId &&
    opportunity.ownerId !== user.id
  ) {
    return {
      ok: false,
      message: "You cannot move a sale owned by another user.",
    };
  }

  if (!(await salesPipelineStageForId(prisma, salesPipelineStageId))) {
    return { ok: false, message: "The suggested stage is no longer active." };
  }

  const occurredAt = new Date();
  let gateWarningCount = 0;
  let moved = false;

  try {
    await prisma.$transaction(async (tx) => {
      const lifecycleData = await lifecycleOpportunityDataForPipelineStage(
        tx,
        salesPipelineStageId,
        opportunity.stage as SalesStageValue,
        occurredAt,
      );

      if (
        opportunity.stage === lifecycleData.stage &&
        opportunity.salesPipelineStageId === lifecycleData.salesPipelineStageId
      ) {
        await tx.salesAutomationRun.update({
          where: { id: run.id },
          data: {
            message: "Stage suggestion already matched the current stage.",
            metadata: {
              ...metadata,
              stageMoveAppliedAt: occurredAt.toISOString(),
              stageMoveAppliedByUserId: user.id,
              stageMoveResult: "already-current",
            } satisfies Prisma.InputJsonObject,
          },
        });
        return;
      }

      const gate = await evaluateStageGate({
        client: tx,
        opportunityId: opportunity.id,
        salesPipelineStageId: lifecycleData.salesPipelineStageId,
      });

      if (gate.missing.length) {
        const missingLabels = gate.missing
          .slice(0, 4)
          .map((question) => question.label)
          .join(", ");

        if (gate.mode === "BLOCK") {
          throw new Error(`Required stage data is missing: ${missingLabels}`);
        }

        if (gate.mode === "WARN") {
          gateWarningCount = gate.missing.length;
        }
      }

      await tx.salesOpportunity.update({
        where: { id: opportunity.id },
        data: lifecycleData,
      });

      await recordSalesStageChange(tx, {
        opportunityId: opportunity.id,
        fromStage: opportunity.stage as SalesStageValue,
        fromPipelineStageId: opportunity.salesPipelineStageId,
        toStage: lifecycleData.stage,
        toPipelineStageId: lifecycleData.salesPipelineStageId,
        occurredAt,
        source: "sales-automation-stage-suggestion",
        userId: user.id,
      });

      await runSalesAutomationTrigger(tx, {
        opportunityId: opportunity.id,
        salesPipelineStageId: lifecycleData.salesPipelineStageId,
        trigger: "STAGE_ENTERED",
        userId: user.id,
        metadata: {
          source: "sales-automation-stage-suggestion",
          automationRunId: run.id,
          fromPipelineStageId: opportunity.salesPipelineStageId,
          toPipelineStageId: lifecycleData.salesPipelineStageId,
        },
      });

      const taskId = stringValue(metadata.taskId);
      if (taskId) {
        await tx.task
          .update({ where: { id: taskId }, data: { status: "DONE" } })
          .catch(() => null);
      }

      await tx.salesAutomationRun.update({
        where: { id: run.id },
        data: {
          message: `Stage move approved${stringValue(metadata.suggestedStageName) ? `: ${stringValue(metadata.suggestedStageName)}` : ""}.`,
          metadata: {
            ...metadata,
            stageMoveAppliedAt: occurredAt.toISOString(),
            stageMoveAppliedByUserId: user.id,
            stageMoveResult: "moved",
            toPipelineStageId: lifecycleData.salesPipelineStageId,
            toStage: lifecycleData.stage,
          } satisfies Prisma.InputJsonObject,
        },
      });

      moved = true;
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Stage movement was blocked by required-data gates.",
    };
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${opportunity.id}`);
  revalidatePath("/settings/sales-automation");
  revalidatePath("/tasks");

  if (!moved) {
    return { ok: true, message: "Lead is already in the suggested stage." };
  }

  return {
    ok: true,
    message: gateWarningCount
      ? `Stage moved with ${gateWarningCount} required-data warning${gateWarningCount === 1 ? "" : "s"}.`
      : "Stage suggestion approved and applied.",
  };
}

export async function recordSaleAiFeedbackAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();
  const parsed = aiFeedbackSchema.safeParse({
    saleId: formValue(formData, "saleId"),
    outcome: formValue(formData, "outcome"),
    recommendationAction: formValue(formData, "recommendationAction"),
    recommendationType: formValue(formData, "recommendationType"),
    rationale: formValue(formData, "rationale"),
    targetStage: formValue(formData, "targetStage"),
    targetStageId: formValue(formData, "targetStageId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Feedback was not saved.",
    };
  }

  const sale = await prisma.salesOpportunity.findUnique({
    where: { id: parsed.data.saleId },
    select: { contactId: true, id: true, ownerId: true, title: true },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  if (user.role !== "ADMIN" && sale.ownerId && sale.ownerId !== user.id) {
    return {
      ok: false,
      message: "You cannot record feedback on a sale owned by another user.",
    };
  }

  await prisma.salesCommunication.create({
    data: {
      body: parsed.data.rationale || null,
      channel: "SYSTEM",
      contactId: sale.contactId,
      direction: "INTERNAL",
      metadata: {
        outcome: parsed.data.outcome,
        recommendationAction: parsed.data.recommendationAction ?? null,
        recommendationType: parsed.data.recommendationType,
        source: "sales-ai-feedback",
        targetStage: parsed.data.targetStage ?? null,
        targetStageId: parsed.data.targetStageId ?? null,
      } satisfies Prisma.InputJsonObject,
      opportunityId: sale.id,
      subject: "AI recommendation feedback",
      summary: `AI recommendation ${parsed.data.outcome} for ${sale.title}.`,
      userId: user.id,
    },
  });

  revalidatePath(`/sales/${sale.id}`);
  revalidatePath("/settings/sales-automation");

  return {
    ok: true,
    message:
      parsed.data.outcome === "accepted"
        ? "AI feedback recorded."
        : "AI dismissal recorded.",
  };
}

export async function createSaleNoteAction(
  _: SalesNoteActionState,
  formData: FormData,
): Promise<SalesNoteActionState> {
  const user = await requireUser();
  const parsed = salesNoteSchema.safeParse({
    saleId: formData.get("saleId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Note was not saved.",
    };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(parsed.data.saleId, user),
    select: { companyId: true, contactId: true, id: true, title: true },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found or unavailable." };
  }

  const mentionTokens = extractSaleNoteMentionTokens(parsed.data.body);
  const mentionUsers: SaleNoteMentionUser[] = mentionTokens.length
    ? await prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: {
          email: true,
          firstName: true,
          id: true,
          lastName: true,
          name: true,
        },
      })
    : [];
  const mentionResolution = resolveSaleNoteMentions(
    parsed.data.body,
    mentionUsers,
  );
  const mentionTasksByUserId = new Map<
    string,
    { tokens: string[]; user: SaleNoteMentionUser }
  >();

  for (const mention of mentionResolution.resolved) {
    const existing = mentionTasksByUserId.get(mention.user.id);

    if (existing) {
      existing.tokens.push(mention.token);
    } else {
      mentionTasksByUserId.set(mention.user.id, {
        tokens: [mention.token],
        user: mention.user,
      });
    }
  }

  const mentionUserIds = Array.from(mentionTasksByUserId.keys());
  const unmatchedMentionTokens = [
    ...mentionResolution.unresolved,
    ...mentionResolution.ambiguous,
  ];
  const mentionMetadata = mentionResolution.tokens.length
    ? {
        ambiguous: mentionResolution.ambiguous,
        resolvedUserIds: mentionUserIds,
        tokens: mentionResolution.tokens,
        unresolved: mentionResolution.unresolved,
      }
    : null;

  const mentionTaskInputs = Array.from(mentionTasksByUserId.values());
  const createdMentionTaskCount = await prisma.$transaction(async (tx) => {
    const note = await tx.salesCommunication.create({
      data: {
        body: parsed.data.body,
        channel: "NOTE",
        contactId: sale.contactId,
        direction: "INTERNAL",
        metadata: {
          source: "manual-sale-note",
          ...(mentionMetadata ? { mentions: mentionMetadata } : {}),
        } satisfies Prisma.InputJsonObject,
        opportunityId: sale.id,
        subject: "Sales note",
        summary: parsed.data.body,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!mentionTasksByUserId.size) {
      return 0;
    }

    await tx.task.createMany({
      data: mentionTaskInputs.map((mention) => ({
        assigneeId: mention.user.id,
        companyId: sale.companyId,
        contactId: sale.contactId,
        creatorId: user.id,
        description: saleNoteMentionTaskDescription({
          body: parsed.data.body,
          mentionedBy: user.name || user.email,
        }),
        metadata: {
          mentionedByUserId: user.id,
          mentionTokens: mention.tokens,
          opportunityId: sale.id,
          opportunityTitle: sale.title,
          salesCommunicationId: note.id,
          source: "sale-note-mention",
        } satisfies Prisma.InputJsonObject,
        title: saleNoteMentionTaskTitle(sale.title),
      })),
    });

    return mentionTasksByUserId.size;
  });
  const mentionEmailResult = createdMentionTaskCount
    ? await sendSaleNoteMentionEmailAlerts({
        body: parsed.data.body,
        mentionedByName: user.name || user.email,
        mentions: mentionTaskInputs,
        saleId: sale.id,
        saleTitle: sale.title,
      })
    : { failed: 0, sent: 0 };

  await bumpRealtimeTopics([
    realtimeTopics.saleConversation(sale.id),
    sale.contactId ? realtimeTopics.contactConversation(sale.contactId) : null,
    createdMentionTaskCount ? realtimeTopics.tasks : null,
  ]);
  if (createdMentionTaskCount) {
    revalidateHeaderNotifications();
  }

  revalidatePath(`/sales/${sale.id}`);
  revalidatePath("/notes");
  if (createdMentionTaskCount) {
    revalidatePath("/tasks");
  }

  return {
    ok: true,
    message: [
      `Note added to ${sale.title}.`,
      createdMentionTaskCount
        ? `${createdMentionTaskCount} review task${
            createdMentionTaskCount === 1 ? "" : "s"
          } created.`
        : null,
      mentionEmailResult.sent
        ? `${mentionEmailResult.sent} email alert${
            mentionEmailResult.sent === 1 ? "" : "s"
          } sent.`
        : null,
      mentionEmailResult.failed
        ? `${mentionEmailResult.failed} email alert${
            mentionEmailResult.failed === 1 ? "" : "s"
          } could not be sent.`
        : null,
      unmatchedMentionTokens.length
        ? `Could not match ${formatMentionTokens(unmatchedMentionTokens)}.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export async function syncPipedriveLeadFilesAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    return {
      ok: false,
      message: "Only admins can pull Pipedrive files.",
    };
  }

  const saleId = String(formData.get("saleId") ?? "").trim();

  if (!saleId) {
    return { ok: false, message: "Sale is required." };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: saleId }),
    select: { id: true, title: true },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  const result = await syncPipedriveLeadFilesForOpportunity({
    opportunityId: sale.id,
  });

  if (result.status === "not_configured") {
    return { ok: false, message: "Pipedrive is not configured." };
  }

  if (result.status === "not_linked") {
    return {
      ok: false,
      message: "This sale is not linked to a Pipedrive lead.",
    };
  }

  revalidatePath(`/sales/${sale.id}`);

  const warningMessage = result.warnings.length
    ? ` ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"} recorded.`
    : "";

  return {
    ok: true,
    message: `Scanned ${result.filesRead} Pipedrive file${result.filesRead === 1 ? "" : "s"}. Matched ${result.filesMatched}, linked ${result.created}, updated ${result.updated}, skipped ${result.skipped}.${warningMessage}`,
  };
}

export async function syncPipedriveLeadNotesAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    return {
      ok: false,
      message: "Only admins can pull Pipedrive notes.",
    };
  }

  const saleId = String(formData.get("saleId") ?? "").trim();

  if (!saleId) {
    return { ok: false, message: "Sale is required." };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: saleId }),
    select: { contactId: true, id: true, title: true },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  const result = await syncPipedriveLeadNotesForOpportunity({
    opportunityId: sale.id,
  });

  if (result.status === "not_configured") {
    return { ok: false, message: "Pipedrive is not configured." };
  }

  if (result.status === "not_linked") {
    return {
      ok: false,
      message: "This sale is not linked to a Pipedrive lead.",
    };
  }

  await bumpRealtimeTopics([
    realtimeTopics.saleConversation(sale.id),
    sale.contactId ? realtimeTopics.contactConversation(sale.contactId) : null,
  ]);
  revalidatePath(`/sales/${sale.id}`);
  revalidatePath("/notes");
  if (sale.contactId) {
    revalidatePath(`/contacts/${sale.contactId}`);
  }

  const warningMessage = result.warnings.length
    ? ` ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"} recorded.`
    : "";

  return {
    ok: true,
    message: `Pulled ${result.notesRead} Pipedrive note${result.notesRead === 1 ? "" : "s"}. Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}.${warningMessage}`,
  };
}

export async function sendSaleToSpruceAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    return {
      ok: false,
      message: "Only admins can send sales to Spruce.",
    };
  }

  const parsed = sendSaleToSpruceSchema.safeParse({
    saleId: formData.get("saleId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Sale is required.",
    };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: parsed.data.saleId }),
    select: { contactId: true, id: true },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  const crmBaseUrl = await appBaseUrlFromHeaders();
  const result = await sendSalesOpportunityToSpruce({
    crmBaseUrl,
    saleId: sale.id,
    userId: user.id,
  });

  if (result.ok) {
    await bumpRealtimeTopics([
      realtimeTopics.saleConversation(sale.id),
      sale.contactId ? realtimeTopics.contactConversation(sale.contactId) : null,
    ]);
    revalidatePath(`/sales/${sale.id}`);
    revalidatePath("/sales");
    if (sale.contactId) {
      revalidatePath(`/contacts/${sale.contactId}`);
    }
  }

  return {
    ok: result.ok,
    message: result.message,
    saleId: sale.id,
  };
}

export async function syncPipedriveLeadEmailsAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    return {
      ok: false,
      message: "Only admins can pull Pipedrive emails.",
    };
  }

  const saleId = String(formData.get("saleId") ?? "").trim();

  if (!saleId) {
    return { ok: false, message: "Sale is required." };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: saleId }),
    select: { contactId: true, id: true, title: true },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  const result = await syncPipedriveLeadEmailsForOpportunity({
    maxPages: manualPipedriveLeadEmailMaxPages,
    opportunityId: sale.id,
  });

  if (result.status === "not_configured") {
    return { ok: false, message: "Pipedrive is not configured." };
  }

  if (result.status === "not_supported") {
    return { ok: false, message: "Pipedrive email reads are not supported." };
  }

  if (result.status === "not_linked") {
    return {
      ok: false,
      message: "This sale is not linked to a Pipedrive lead.",
    };
  }

  await bumpRealtimeTopics([
    realtimeTopics.saleConversation(sale.id),
    sale.contactId ? realtimeTopics.contactConversation(sale.contactId) : null,
    realtimeTopics.inbox,
  ]);
  revalidatePath(`/sales/${sale.id}`);
  if (sale.contactId) {
    revalidatePath(`/contacts/${sale.contactId}`);
  }

  const warningMessage = salesPipedriveWarningMessage(result.warnings);

  return {
    ok: true,
    message: `Pulled ${result.emailsRead} Pipedrive email${result.emailsRead === 1 ? "" : "s"}. Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}.${warningMessage}`,
  };
}

export async function syncPipedriveLeadUpdatesAction(
  _: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    return {
      ok: false,
      message: "Only admins can pull Pipedrive updates.",
    };
  }

  const saleId = String(formData.get("saleId") ?? "").trim();

  if (!saleId) {
    return { ok: false, message: "Sale is required." };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: saleId }),
    select: { contactId: true, id: true, title: true },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  const noteResult = await syncPipedriveLeadNotesForOpportunity({
    opportunityId: sale.id,
  });

  if (noteResult.status === "not_configured") {
    return { ok: false, message: "Pipedrive is not configured." };
  }

  if (noteResult.status === "not_linked") {
    return {
      ok: false,
      message: "This sale is not linked to a Pipedrive lead.",
    };
  }

  const emailResult = await syncPipedriveLeadEmailsForOpportunity({
    maxPages: manualPipedriveLeadEmailMaxPages,
    opportunityId: sale.id,
  });
  const noteSummary = `Notes: read ${noteResult.notesRead}, created ${noteResult.created}, updated ${noteResult.updated}, skipped ${noteResult.skipped}.`;
  const emailSummary = `Emails: read ${emailResult.emailsRead}, created ${emailResult.created}, updated ${emailResult.updated}, skipped ${emailResult.skipped}.`;

  await bumpRealtimeTopics([
    realtimeTopics.saleConversation(sale.id),
    sale.contactId ? realtimeTopics.contactConversation(sale.contactId) : null,
    realtimeTopics.inbox,
  ]);
  revalidatePath(`/sales/${sale.id}`);
  revalidatePath("/notes");
  if (sale.contactId) {
    revalidatePath(`/contacts/${sale.contactId}`);
  }

  if (emailResult.status === "not_configured") {
    return {
      ok: false,
      message: `${noteSummary} Pipedrive emails could not be pulled because Pipedrive is not configured.`,
    };
  }

  if (emailResult.status === "not_supported") {
    return {
      ok: false,
      message: `${noteSummary} Pipedrive email reads are not supported.`,
    };
  }

  if (emailResult.status === "not_linked") {
    return {
      ok: false,
      message: `${noteSummary} Pipedrive emails could not be pulled because this sale is not linked to a readable Pipedrive lead/person.`,
    };
  }

  const warningMessage = salesPipedriveWarningMessage([
    ...noteResult.warnings,
    ...emailResult.warnings,
  ]);

  return {
    ok: true,
    message: `Pulled Pipedrive updates. ${noteSummary} ${emailSummary}${warningMessage}`,
  };
}

export async function syncPipedriveLeadFilesOnSaleViewAction(
  saleId: string,
): Promise<{
  ok: boolean;
  reason:
    | "missing-sale"
    | "not-configured"
    | "not-linked"
    | "synced"
    | "throttled";
  refreshed: boolean;
}> {
  const user = await requireUser();
  const normalizedSaleId = String(saleId ?? "").trim();

  if (!normalizedSaleId) {
    return { ok: false, reason: "missing-sale", refreshed: false };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: normalizedSaleId }),
    select: { id: true },
  });

  if (!sale) {
    return { ok: false, reason: "missing-sale", refreshed: false };
  }

  const leadLink = await prisma.externalRecordLink.findFirst({
    where: {
      externalType: "lead",
      internalId: sale.id,
      internalType: "salesOpportunity",
      provider: "pipedrive",
    },
    select: { id: true, metadata: true },
  });

  if (!leadLink) {
    return { ok: true, reason: "not-linked", refreshed: false };
  }

  const now = new Date();
  const metadata = jsonObject(leadLink.metadata);
  const lastAutoSyncAt = stringValue(metadata.lastSaleViewPipedriveFileSyncAt);

  if (
    isRecentTimestamp(lastAutoSyncAt, now, pipedriveSaleViewFileSyncThrottleMs)
  ) {
    return { ok: true, reason: "throttled", refreshed: false };
  }

  const result = await syncPipedriveLeadFilesForOpportunity({
    now,
    opportunityId: sale.id,
  });

  await prisma.externalRecordLink.update({
    where: { id: leadLink.id },
    data: {
      metadata: {
        ...metadata,
        lastSaleViewPipedriveFileSyncAt: now.toISOString(),
        lastSaleViewPipedriveFileSyncChangedCount:
          result.created + result.updated,
        lastSaleViewPipedriveFileSyncMatchedCount: result.filesMatched,
        lastSaleViewPipedriveFileSyncReadCount: result.filesRead,
        lastSaleViewPipedriveFileSyncStatus: result.status,
        lastSaleViewPipedriveFileSyncWarningCount: result.warnings.length,
      } as Prisma.InputJsonObject,
    },
  });

  if (result.status === "not_configured") {
    return { ok: true, reason: "not-configured", refreshed: false };
  }

  if (result.status === "not_linked") {
    return { ok: true, reason: "not-linked", refreshed: false };
  }

  const refreshed = result.created > 0 || result.updated > 0;

  if (refreshed) {
    revalidatePath(`/sales/${sale.id}`);
  }

  return { ok: true, reason: "synced", refreshed };
}

export async function syncPipedriveLeadNotesOnSaleViewAction(
  saleId: string,
): Promise<{
  ok: boolean;
  reason:
    | "missing-sale"
    | "not-configured"
    | "not-linked"
    | "synced"
    | "throttled";
  refreshed: boolean;
}> {
  const user = await requireUser();
  const normalizedSaleId = String(saleId ?? "").trim();

  if (!normalizedSaleId) {
    return { ok: false, reason: "missing-sale", refreshed: false };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: normalizedSaleId }),
    select: { contactId: true, id: true },
  });

  if (!sale) {
    return { ok: false, reason: "missing-sale", refreshed: false };
  }

  const leadLink = await prisma.externalRecordLink.findFirst({
    where: {
      externalType: "lead",
      internalId: sale.id,
      internalType: "salesOpportunity",
      provider: "pipedrive",
    },
    select: { id: true, metadata: true },
  });

  if (!leadLink) {
    return { ok: true, reason: "not-linked", refreshed: false };
  }

  const now = new Date();
  const metadata = jsonObject(leadLink.metadata);
  const lastAutoSyncAt = stringValue(
    metadata.lastSaleViewPipedriveNoteSyncAt,
  );

  if (
    isRecentTimestamp(lastAutoSyncAt, now, pipedriveSaleViewNoteSyncThrottleMs)
  ) {
    return { ok: true, reason: "throttled", refreshed: false };
  }

  const result = await syncPipedriveLeadNotesForOpportunity({
    now,
    opportunityId: sale.id,
  });

  await prisma.externalRecordLink.update({
    where: { id: leadLink.id },
    data: {
      metadata: {
        ...metadata,
        lastSaleViewPipedriveNoteSyncAt: now.toISOString(),
        lastSaleViewPipedriveNoteSyncChangedCount:
          result.created + result.updated,
        lastSaleViewPipedriveNoteSyncReadCount: result.notesRead,
        lastSaleViewPipedriveNoteSyncStatus: result.status,
        lastSaleViewPipedriveNoteSyncWarningCount: result.warnings.length,
      } as Prisma.InputJsonObject,
    },
  });

  if (result.status === "not_configured") {
    return { ok: true, reason: "not-configured", refreshed: false };
  }

  if (result.status === "not_linked") {
    return { ok: true, reason: "not-linked", refreshed: false };
  }

  const refreshed = result.created > 0 || result.updated > 0;

  if (refreshed) {
    await bumpRealtimeTopics([
      realtimeTopics.saleConversation(sale.id),
      sale.contactId ? realtimeTopics.contactConversation(sale.contactId) : null,
    ]);
    revalidatePath(`/sales/${sale.id}`);
    revalidatePath("/notes");
    if (sale.contactId) {
      revalidatePath(`/contacts/${sale.contactId}`);
    }
  }

  return { ok: true, reason: "synced", refreshed };
}

export async function syncPipedriveLeadEmailsOnSaleViewAction(
  saleId: string,
): Promise<{
  ok: boolean;
  reason:
    | "missing-sale"
    | "not-configured"
    | "not-linked"
    | "not-supported"
    | "synced"
    | "throttled";
  refreshed: boolean;
}> {
  const user = await requireUser();
  const normalizedSaleId = String(saleId ?? "").trim();

  if (!normalizedSaleId) {
    return { ok: false, reason: "missing-sale", refreshed: false };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: normalizedSaleId }),
    select: { contactId: true, id: true },
  });

  if (!sale) {
    return { ok: false, reason: "missing-sale", refreshed: false };
  }

  const leadLink = await prisma.externalRecordLink.findFirst({
    where: {
      externalType: "lead",
      internalId: sale.id,
      internalType: "salesOpportunity",
      provider: "pipedrive",
    },
    select: { id: true, metadata: true },
  });

  if (!leadLink) {
    return { ok: true, reason: "not-linked", refreshed: false };
  }

  const now = new Date();
  const metadata = jsonObject(leadLink.metadata);
  const lastAutoSyncAt = stringValue(
    metadata.lastSaleViewPipedriveEmailSyncAt,
  );

  if (
    isRecentTimestamp(lastAutoSyncAt, now, pipedriveSaleViewEmailSyncThrottleMs)
  ) {
    return { ok: true, reason: "throttled", refreshed: false };
  }

  const result = await syncPipedriveLeadEmailsForOpportunity({
    now,
    opportunityId: sale.id,
  });

  await prisma.externalRecordLink.update({
    where: { id: leadLink.id },
    data: {
      metadata: {
        ...metadata,
        lastSaleViewPipedriveEmailSyncAt: now.toISOString(),
        lastSaleViewPipedriveEmailSyncChangedCount:
          result.created + result.updated,
        lastSaleViewPipedriveEmailSyncReadCount: result.emailsRead,
        lastSaleViewPipedriveEmailSyncStatus: result.status,
        lastSaleViewPipedriveEmailSyncWarningCount: result.warnings.length,
      } as Prisma.InputJsonObject,
    },
  });

  if (result.status === "not_configured") {
    return { ok: true, reason: "not-configured", refreshed: false };
  }

  if (result.status === "not_supported") {
    return { ok: true, reason: "not-supported", refreshed: false };
  }

  if (result.status === "not_linked") {
    return { ok: true, reason: "not-linked", refreshed: false };
  }

  const refreshed = result.created > 0 || result.updated > 0;

  if (refreshed) {
    await bumpRealtimeTopics([
      realtimeTopics.saleConversation(sale.id),
      sale.contactId ? realtimeTopics.contactConversation(sale.contactId) : null,
      realtimeTopics.inbox,
    ]);
    revalidatePath(`/sales/${sale.id}`);
    if (sale.contactId) {
      revalidatePath(`/contacts/${sale.contactId}`);
    }
  }

  return { ok: true, reason: "synced", refreshed };
}

export async function updateSaleLeadScopeAction(
  _: LeadScopeActionState,
  formData: FormData,
): Promise<LeadScopeActionState> {
  const user = await requireUser();

  const saleId = String(formData.get("saleId") ?? "").trim();
  const mode = String(formData.get("mode") ?? "manual");

  if (!saleId) {
    return { ok: false, message: "Sale ID is missing." };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(saleId, user),
    select: {
      id: true,
      title: true,
      nextStep: true,
      source: true,
      leadScope: true,
      communications: {
        orderBy: { occurredAt: "desc" },
        take: 12,
        select: {
          subject: true,
          summary: true,
          body: true,
        },
      },
    },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  let scope: LeadScope;

  if (mode === "infer") {
    const inferred = inferLeadScopeFromText([
      sale.title,
      sale.nextStep,
      sale.source,
      ...sale.communications.flatMap((communication) => [
        communication.subject,
        communication.summary,
        communication.body,
      ]),
    ]);
    scope = mergeLeadScope(normaliseLeadScope(sale.leadScope), inferred);
  } else {
    scope = {
      productTypes: checkedProductTypes(formData),
      customProductTypes: splitCustomProducts(
        formValue(formData, "customProductTypes"),
      ),
      budget: formValue(formData, "budget")?.trim() || null,
      timeframe: formValue(formData, "timeframe")?.trim() || null,
      notes: formValue(formData, "notes")?.trim() || null,
      source: "manual",
      confidence: null,
      updatedAt: new Date().toISOString(),
    };
  }

  await prisma.salesOpportunity.update({
    where: { id: sale.id },
    data: {
      leadScope: leadScopeToJson(scope),
      aiGuidanceFingerprint: null,
    },
  });

  revalidatePath(`/sales/${sale.id}`);
  revalidatePath("/sales");

  return {
    ok: true,
    message:
      mode === "infer" ? "Scope suggestions applied." : "Lead scope saved.",
    scope,
  };
}

export async function updateSaleDiscoveryAnswersAction(
  _: DiscoveryAnswersActionState,
  formData: FormData,
): Promise<DiscoveryAnswersActionState> {
  const user = await requireUser();
  const saleId = String(formData.get("saleId") ?? "").trim();

  if (!saleId) {
    return { ok: false, message: "Sale ID is missing." };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(saleId, user),
    select: { id: true },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  const answerKeys = Array.from(new Set(formData.keys())).filter(
    (key) => typeof key === "string" && key.startsWith("answer:"),
  );

  if (!answerKeys.length) {
    return { ok: false, message: "No discovery answers were submitted." };
  }

  const questionIds = Array.from(
    new Set(answerKeys.map((key) => String(key).split(":")[1]).filter(Boolean)),
  );
  const questions = await prisma.discoveryQuestion.findMany({
    where: { id: { in: questionIds }, isActive: true },
    select: {
      id: true,
      answerMode: true,
      answerType: true,
      helpText: true,
      label: true,
      options: true,
      version: true,
    },
  });
  const questionById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const requiredAnswerKeys = Array.from(
    new Set(
      formData
        .getAll("requiredAnswer")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  for (const key of requiredAnswerKeys) {
    const [, questionId] = key.split(":");
    const question = questionById.get(questionId);
    if (!question) continue;

    const formValues = formData
      .getAll(key)
      .filter((value): value is string => typeof value === "string");
    const answerValue = discoveryAnswerValue({
      answerMode: question.answerMode,
      answerType: question.answerType,
      rawValue: isMultiAnswer({
        answerMode: question.answerMode,
        answerType: question.answerType,
      })
        ? formValues
        : (formValues[0] ?? ""),
    });

    if (answerValue === null) {
      return {
        ok: false,
        message: "Complete the required discovery answers before saving.",
      };
    }
  }

  let savedCount = 0;

  await prisma.$transaction(async (tx) => {
    const productIdsToAttach = new Set<string>();

    for (const key of answerKeys) {
      const [, questionId, contextType, contextId = "lead"] =
        String(key).split(":");
      const question = questionById.get(questionId);
      if (!question) continue;

      const productId = contextType === "product" ? contextId : null;
      const categoryId = contextType === "category" ? contextId : null;
      const formValues = formData
        .getAll(String(key))
        .filter((value): value is string => typeof value === "string");
      const answerValue = discoveryAnswerValue({
        answerMode: question.answerMode,
        answerType: question.answerType,
        rawValue: isMultiAnswer({
          answerMode: question.answerMode,
          answerType: question.answerType,
        })
          ? formValues
          : (formValues[0] ?? ""),
      });
      const where = {
        opportunityId: sale.id,
        questionId,
        productId,
        categoryId,
      };

      if (answerValue === null) {
        await tx.opportunityDiscoveryAnswer.deleteMany({ where });
        continue;
      }

      if (question.answerType === "PRODUCT_SELECT" && typeof answerValue === "string") {
        productIdsToAttach.add(answerValue);
      }
      if (question.answerType === "PRODUCT_MULTI_SELECT" && Array.isArray(answerValue)) {
        answerValue.forEach((productId) => productIdsToAttach.add(String(productId)));
      }

      const existing = await tx.opportunityDiscoveryAnswer.findFirst({
        where,
        select: { id: true },
      });
      const data = {
        value: answerValue as Prisma.InputJsonValue,
        questionAnswerModeSnapshot: question.answerMode,
        questionAnswerTypeSnapshot: question.answerType,
        questionHelpTextSnapshot: question.helpText,
        questionLabelSnapshot: question.label,
        questionOptionsSnapshot: question.options ?? Prisma.JsonNull,
        questionVersionSnapshot: question.version,
        source: "MANUAL" as const,
        answeredAt: new Date(),
        answeredByUserId: user.id,
      };

      if (existing) {
        await tx.opportunityDiscoveryAnswer.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await tx.opportunityDiscoveryAnswer.create({
          data: {
            ...where,
            ...data,
          },
        });
      }

      savedCount += 1;
    }

    if (productIdsToAttach.size) {
      const validProducts = await tx.product.findMany({
        where: { id: { in: Array.from(productIdsToAttach) }, isActive: true },
        select: { id: true },
      });

      for (const product of validProducts) {
        await tx.opportunityProduct.upsert({
          where: {
            opportunityId_productId: {
              opportunityId: sale.id,
              productId: product.id,
            },
          },
          update: {
            status: "CONFIRMED",
            source: "discovery-product-selector",
          },
          create: {
            opportunityId: sale.id,
            productId: product.id,
            status: "CONFIRMED",
            source: "discovery-product-selector",
          },
        });
      }
    }
  });

  revalidatePath(`/sales/${sale.id}`);
  revalidatePath("/sales");

  return {
    ok: true,
    message: savedCount
      ? `${savedCount} discovery answer${savedCount === 1 ? "" : "s"} saved.`
      : "Blank discovery answers cleared.",
  };
}
