import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import {
  lifecycleOpportunityDataForPipelineStage,
  recordSalesOpportunityCreated,
} from "@/lib/sales/lifecycle";
import {
  parseSalesDefaults,
  resolveSalesDefaultOwnerId,
} from "@/lib/sales/defaults";
import { leadSourceValueFromText } from "@/lib/sales/lead-sources";
import { getCrmSettings } from "@/lib/settings";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";
import {
  attributionRequestErrorResponse,
  attributionJsonResponse,
  attributionOptionsResponse,
  readAttributionRequestPayload,
  requestIpAddress,
  requestLocation,
  requireAttributionDomainAccess,
} from "@/lib/attribution/http";
import { logAttributionDebugEvent } from "@/lib/attribution/debug-events";
import {
  formConversationSummary,
  formFieldsBody,
  normaliseFormFields,
  normaliseLeadEmail,
  shouldReplaceSubmittedFormFields,
} from "@/lib/attribution/form-fields";
import {
  attributionRecordMetadata,
  createAttributionRecord,
  parseAttributionPayload,
  resolveAttributionSource,
  upsertAttributionSnapshot,
} from "@/lib/attribution/tracking";

function optionalString(maxLength: number) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(maxLength).optional(),
  );
}

const leadCaptureSchema = z
  .object({
    firstName: optionalString(160),
    lastName: optionalString(160),
    name: optionalString(220),
    email: optionalString(320),
    phone: optionalString(80),
    companyName: optionalString(220),
    message: optionalString(5000),
    source: optionalString(160),
    title: optionalString(220),
    fields: z.unknown().optional(),
    formFields: z.unknown().optional(),
    form: z.unknown().optional(),
    attribution: z.unknown().optional(),
    crm_attribution: z.unknown().optional(),
  })
  .passthrough();

function splitName(payload: { firstName?: string; lastName?: string; name?: string }) {
  if (payload.firstName || payload.lastName) {
    return {
      firstName: payload.firstName || "Website",
      lastName: payload.lastName || "Enquiry",
    };
  }

  const parts = (payload.name || "Website Enquiry").split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] || "Website",
    lastName: parts.slice(1).join(" ") || "Enquiry",
  };
}

function parsePossiblyStringifiedAttribution(value: unknown) {
  if (typeof value !== "string") {
    return parseAttributionPayload(value);
  }

  try {
    return parseAttributionPayload(JSON.parse(value));
  } catch {
    return parseAttributionPayload({});
  }
}

const DUPLICATE_LEAD_WINDOW_MINUTES = 15;

function duplicateLeadWindowStart() {
  return new Date(Date.now() - DUPLICATE_LEAD_WINDOW_MINUTES * 60 * 1000);
}

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function OPTIONS(request: Request) {
  return attributionOptionsResponse(request);
}

export async function POST(request: Request) {
  const domainAccess = await requireAttributionDomainAccess(request);

  if (!domainAccess.ok) {
    return domainAccess.response;
  }

  let payload: unknown;

  try {
    payload = await readAttributionRequestPayload(request);
  } catch (error) {
    return attributionRequestErrorResponse(request, error);
  }

  const parsed = leadCaptureSchema.safeParse(payload);

  if (!parsed.success) {
    await logAttributionDebugEvent(request, {
      eventType: "form.rejected",
      level: "warning",
      message: parsed.error.issues[0]?.message ?? "Invalid lead payload.",
      metadata: { reason: "validation" },
    });

    return attributionJsonResponse(
      request,
      { error: parsed.error.issues[0]?.message ?? "Invalid lead payload." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const dataRecord = data as Record<string, unknown>;
  const formFields = normaliseFormFields(dataRecord);
  const serialisedFormFields = JSON.parse(
    JSON.stringify(formFields),
  ) as Prisma.InputJsonValue;
  const leadEmail = normaliseLeadEmail(data.email, formFields);
  const conversationBody = formFieldsBody(data.message, formFields);
  const attribution = parsePossiblyStringifiedAttribution(
    data.attribution ?? data.crm_attribution,
  );
  const location = await requestLocation(request);
  const snapshot = await upsertAttributionSnapshot({
    attribution,
    userAgent: request.headers.get("user-agent"),
    ipAddress: requestIpAddress(request),
    location,
  });
  const { firstName, lastName } = splitName(data);
  const phone = normalizedContactPhone(data.phone);
  const sourceDecision = await resolveAttributionSource({
    submittedSource: data.source,
    attribution,
  });
  const source = sourceDecision.source;
  const contactLeadSource = leadSourceValueFromText(source) ?? "Website";
  const attributionMetadata = attributionRecordMetadata(attribution);
  const sourceMetadata = {
    source,
    sourceRuleId: sourceDecision.ruleId,
    sourceRuleName: sourceDecision.ruleName,
    fallbackSource: sourceDecision.fallbackSource,
  } satisfies Prisma.InputJsonObject;
  const contactMatches = [
    leadEmail
      ? {
          OR: [
            { email: { equals: leadEmail, mode: "insensitive" } },
            {
              additionalEmails: {
                some: { email: { equals: leadEmail, mode: "insensitive" } },
              },
            },
          ],
        }
      : null,
    phone
      ? {
          OR: [
            { phoneNormalized: phone },
            { additionalPhones: { some: { phoneNormalized: phone } } },
          ],
        }
      : null,
  ].filter(Boolean) as Prisma.ContactWhereInput[];

  const existingContact = contactMatches.length
    ? await prisma.contact.findFirst({
        where: { OR: contactMatches },
        select: {
          id: true,
          companyId: true,
          companyName: true,
          email: true,
          phone: true,
          phoneNormalized: true,
          leadSource: true,
        },
      })
    : null;

  const contact = existingContact
    ? await prisma.contact.update({
        where: { id: existingContact.id },
        data: {
          firstName,
          lastName,
          email: existingContact.email ?? leadEmail,
          phone: existingContact.phone ?? phone,
          phoneNormalized: existingContact.phoneNormalized ?? phone,
          leadSource: existingContact.leadSource ?? contactLeadSource,
          companyName: data.companyName || existingContact.companyName,
          attribution: { ...attributionMetadata, ...sourceMetadata },
        },
        select: { id: true, companyId: true },
      })
    : await prisma.contact.create({
        data: {
          firstName,
          lastName,
          email: leadEmail,
          phone,
          phoneNormalized: phone,
          leadSource: contactLeadSource,
          companyName: data.companyName || null,
          attribution: { ...attributionMetadata, ...sourceMetadata },
        },
        select: { id: true, companyId: true },
      });

  const opportunityTitle = data.title || `${source} enquiry - ${firstName} ${lastName}`;
  const duplicateOpportunity = await prisma.salesOpportunity.findFirst({
    where: {
      contactId: contact.id,
      source,
      title: opportunityTitle,
      stage: { notIn: ["WON", "LOST"] },
      createdAt: { gte: duplicateLeadWindowStart() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      communications: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          body: true,
          fromAddress: true,
          metadata: true,
        },
      },
    },
  });

  if (duplicateOpportunity) {
    const duplicateCommunication = duplicateOpportunity.communications[0] ?? null;
    const communicationId = duplicateCommunication?.id ?? null;
    const existingMetadata = jsonRecord(duplicateCommunication?.metadata);
    const existingFormFields = existingMetadata.formFields;
    const enrichedDuplicate = Boolean(
      duplicateCommunication &&
        shouldReplaceSubmittedFormFields({
          existingFields: existingFormFields,
          candidateFields: formFields,
          existingBody: duplicateCommunication.body,
          candidateBody: conversationBody,
        }),
    );

    if (duplicateCommunication && enrichedDuplicate) {
      const enrichedMetadata = JSON.parse(
        JSON.stringify({
          ...existingMetadata,
          source: "attribution-lead-api",
          attribution: { ...attributionMetadata, ...sourceMetadata },
          formFields: serialisedFormFields,
          duplicateEnrichedAt: new Date().toISOString(),
          duplicatePreviousFormFieldCount: Array.isArray(existingFormFields)
            ? existingFormFields.length
            : 0,
        }),
      ) as Prisma.InputJsonObject;

      await prisma.salesCommunication.update({
        where: { id: duplicateCommunication.id },
        data: {
          summary: formConversationSummary(data.message, formFields),
          body: conversationBody,
          fromAddress: leadEmail ?? duplicateCommunication.fromAddress,
          metadata: enrichedMetadata,
        },
      });
    }

    await logAttributionDebugEvent(request, {
      eventType: enrichedDuplicate ? "form.duplicate_enriched" : "form.duplicate",
      level: "warning",
      message: enrichedDuplicate
        ? "Duplicate website form lead enriched the existing conversation."
        : "Duplicate website form lead ignored.",
      attribution,
      attributionSnapshotId: snapshot?.id ?? null,
      metadata: {
        contactId: contact.id,
        opportunityId: duplicateOpportunity.id,
        communicationId,
        source,
        sourceRuleId: sourceDecision.ruleId,
        sourceRuleName: sourceDecision.ruleName,
        duplicateWindowMinutes: DUPLICATE_LEAD_WINDOW_MINUTES,
        enrichedDuplicate,
        previousFormFieldCount: Array.isArray(existingFormFields)
          ? existingFormFields.length
          : 0,
        candidateFormFieldCount: formFields.length,
      },
    });

    return attributionJsonResponse(request, {
      ok: true,
      duplicate: true,
      enrichedDuplicate,
      contactId: contact.id,
      opportunityId: duplicateOpportunity.id,
      communicationId,
    });
  }

  const occurredAt = new Date();
  const settings = await getCrmSettings();
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const opportunity = await prisma.$transaction(async (tx) => {
    const lifecycleData = await lifecycleOpportunityDataForPipelineStage(
      tx,
      salesDefaults.defaultSalesPipelineStageId,
      "LEAD",
      occurredAt,
    );
    const createdOpportunity = await tx.salesOpportunity.create({
      data: {
        title: opportunityTitle,
        ...lifecycleData,
        currency: workspaceDefaults.currency,
        source,
        nextStep: "Review website enquiry and follow up.",
        ownerId: resolveSalesDefaultOwnerId({ salesDefaults }),
        contactId: contact.id,
        companyId: contact.companyId,
        attribution: { ...attributionMetadata, ...sourceMetadata },
      },
    });

    await recordSalesOpportunityCreated(tx, {
      opportunityId: createdOpportunity.id,
      occurredAt,
      salesPipelineStageId: lifecycleData.salesPipelineStageId,
      source: "attribution-lead-api",
      stage: lifecycleData.stage,
    });

    return createdOpportunity;
  });

  const communication = await prisma.salesCommunication.create({
    data: {
      opportunityId: opportunity.id,
      contactId: contact.id,
      channel: "EMAIL",
      direction: "INBOUND",
      subject: data.title || "Website enquiry received",
      summary: formConversationSummary(data.message, formFields),
      body: conversationBody,
      fromAddress: leadEmail,
      toAddress: "CRM website form",
      metadata: {
        source: "attribution-lead-api",
        attribution: { ...attributionMetadata, ...sourceMetadata },
        formFields: serialisedFormFields,
      },
    },
  });

  await createAttributionRecord({
    source: "FORM",
    attribution,
    attributionSnapshotId: snapshot?.id ?? null,
    contactId: contact.id,
    opportunityId: opportunity.id,
    metadata: {
      communicationId: communication.id,
      sourceDecision: sourceMetadata,
      requestLocation: location,
      formFields: serialisedFormFields,
      rawPayload: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
    },
  });

  await logAttributionDebugEvent(request, {
    eventType: "form.captured",
    message: "Website form lead captured.",
    attribution,
    attributionSnapshotId: snapshot?.id ?? null,
    metadata: {
      contactId: contact.id,
      opportunityId: opportunity.id,
      communicationId: communication.id,
      formFieldCount: formFields.length,
      source,
      sourceRuleId: sourceDecision.ruleId,
      sourceRuleName: sourceDecision.ruleName,
    },
  });

  return attributionJsonResponse(request, {
    ok: true,
    contactId: contact.id,
    opportunityId: opportunity.id,
    communicationId: communication.id,
  });
}
