import "server-only";

import type { Prisma } from "@prisma/client";
import {
  ensureSpruceZapierIntegrationConnection,
  getSpruceZapierRuntimeConfig,
  spruceProvider,
} from "@/lib/integrations/spruce-zapier";
import { prisma } from "@/lib/prisma";

export const spruceJobExternalType = "job";
export const spruceOutboundJobRequestExternalType = "outbound-job-request";
export const spruceSalesOpportunityInternalType = "salesOpportunity";

const spruceManualSaleSendSource = "spruce-zapier-manual-sale-send";
const spruceManualSaleSendSyncType = "manual-sale-send";
const spruceOutboundSendExternalIdPrefix = "spruce:outbound-send:";
const outboundRequestTimeoutMs = 15000;

type SpruceOutboundSaleRecord = Prisma.SalesOpportunityGetPayload<{
  select: typeof spruceOutboundSaleSelect;
}>;

export type SpruceSaleOutboundResult = {
  externalJobId: string | null;
  message: string;
  ok: boolean;
  recordsWritten: number;
  saleId: string;
  status: "sent" | "skipped" | "error";
};

const spruceOutboundSaleSelect = {
  id: true,
  title: true,
  stage: true,
  source: true,
  nextStep: true,
  valueCents: true,
  currency: true,
  contactId: true,
  companyId: true,
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      county: true,
      postcode: true,
      country: true,
    },
  },
  company: {
    select: {
      id: true,
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      county: true,
      postcode: true,
      country: true,
    },
  },
} satisfies Prisma.SalesOpportunitySelect;

export async function sendSalesOpportunityToSpruce({
  crmBaseUrl,
  now = new Date(),
  saleId,
  userId,
}: {
  crmBaseUrl: string;
  now?: Date;
  saleId: string;
  userId: string;
}): Promise<SpruceSaleOutboundResult> {
  const connection = await ensureSpruceZapierIntegrationConnection();
  const [runtimeConfig, sale, existingLink] = await Promise.all([
    getSpruceZapierRuntimeConfig(),
    prisma.salesOpportunity.findUnique({
      where: { id: saleId },
      select: spruceOutboundSaleSelect,
    }),
    prisma.externalRecordLink.findFirst({
      where: {
        externalType: {
          in: [spruceJobExternalType, spruceOutboundJobRequestExternalType],
        },
        internalId: saleId,
        internalType: spruceSalesOpportunityInternalType,
        provider: spruceProvider,
      },
      orderBy: [{ updatedAt: "desc" }],
      select: { externalId: true, externalType: true },
    }),
  ]);

  if (!sale) {
    return {
      externalJobId: null,
      message: "CRM sale could not be found.",
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  if (existingLink) {
    return {
      externalJobId:
        existingLink.externalType === spruceJobExternalType
          ? existingLink.externalId
          : null,
      message:
        existingLink.externalType === spruceJobExternalType
          ? `This sale is already linked to Spruce job ${existingLink.externalId}.`
          : "This sale has already been sent to Spruce and is waiting for a returned job ID.",
      ok: true,
      recordsWritten: 0,
      saleId,
      status: "skipped",
    };
  }

  const outboundWebhookUrl = runtimeConfig.outboundWebhookUrl;

  if (!outboundWebhookUrl) {
    await writeSpruceOutboundSyncLog({
      connectionId: connection.id,
      message:
        "Manual CRM sale send to Spruce skipped because no outbound Zapier webhook URL is configured.",
      metadata: {
        reason: "missing-outbound-webhook-url",
        saleId,
      },
      recordsWritten: 0,
      startedAt: now,
      status: "WARNING",
    });

    return {
      externalJobId: null,
      message:
        "Add the outbound Zapier webhook URL in Settings > Integrations > Spruce before sending sales.",
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  const target = safeOutboundUrl(outboundWebhookUrl);
  if (!target) {
    await writeSpruceOutboundSyncLog({
      connectionId: connection.id,
      message:
        "Manual CRM sale send to Spruce skipped because the outbound Zapier webhook URL is invalid.",
      metadata: {
        reason: "invalid-outbound-webhook-url",
        saleId,
      },
      recordsWritten: 0,
      startedAt: now,
      status: "ERROR",
    });

    return {
      externalJobId: null,
      message:
        "The saved outbound Zapier webhook URL is invalid. Update Spruce settings before sending.",
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  const mapped = mapSaleToSpruceOutboundPayload({
    crmBaseUrl,
    now,
    sale,
  });

  if (mapped.warnings.length) {
    await writeSpruceOutboundSyncLog({
      connectionId: connection.id,
      message: `Manual CRM sale send to Spruce skipped: ${mapped.warnings.join(" ")}`,
      metadata: {
        reason: "missing-required-sale-data",
        saleId,
        warnings: mapped.warnings,
      },
      recordsWritten: 0,
      startedAt: now,
      status: "WARNING",
    });

    return {
      externalJobId: null,
      message: mapped.warnings.join(" "),
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  let outboundResponse: Awaited<ReturnType<typeof postSpruceOutboundWebhook>>;

  try {
    outboundResponse = await postSpruceOutboundWebhook({
      payload: mapped.payload,
      secret: runtimeConfig.outboundWebhookSecret,
      target,
    });
  } catch (error) {
    await writeSpruceOutboundSyncLog({
      connectionId: connection.id,
      message: "Manual CRM sale send to Spruce failed before Zapier responded.",
      metadata: {
        errorName:
          error && typeof error === "object" && "name" in error
            ? String(error.name)
            : "Error",
        saleId,
      },
      recordsWritten: 0,
      startedAt: now,
      status: "ERROR",
    });

    return {
      externalJobId: null,
      message:
        "Spruce/Zapier did not respond. Check the outbound webhook URL and try again.",
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  if (!outboundResponse.ok) {
    await writeSpruceOutboundSyncLog({
      connectionId: connection.id,
      message: `Manual CRM sale send to Spruce failed with HTTP ${outboundResponse.statusCode}.`,
      metadata: {
        responseStatus: outboundResponse.statusCode,
        responseShape: outboundResponse.responseShape,
        saleId,
      },
      recordsWritten: 0,
      startedAt: now,
      status: "ERROR",
    });

    return {
      externalJobId: null,
      message:
        "Spruce/Zapier did not accept the sale. Check Spruce sync history for the HTTP status.",
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  const externalJobId = outboundResponse.externalJobId;
  const externalType = externalJobId
    ? spruceJobExternalType
    : spruceOutboundJobRequestExternalType;
  const externalId = externalJobId ?? sale.id;
  const writeResult = await prisma.$transaction(async (tx) => {
    const link = await tx.externalRecordLink.upsert({
      where: {
        provider_externalType_externalId: {
          externalId,
          externalType,
          provider: spruceProvider,
        },
      },
      create: {
        externalId,
        externalType,
        integrationId: connection.id,
        internalId: sale.id,
        internalType: spruceSalesOpportunityInternalType,
        lastSeenAt: now,
        metadata: {
          crmSaleId: sale.id,
          externalJobId,
          outboundWriteBackApprovedByUserId: userId,
          provider: spruceProvider,
          source: spruceManualSaleSendSource,
        } satisfies Prisma.InputJsonObject,
        provider: spruceProvider,
      },
      update: {
        integrationId: connection.id,
        internalId: sale.id,
        internalType: spruceSalesOpportunityInternalType,
        lastSeenAt: now,
        metadata: {
          crmSaleId: sale.id,
          externalJobId,
          outboundWriteBackApprovedByUserId: userId,
          provider: spruceProvider,
          source: spruceManualSaleSendSource,
        } satisfies Prisma.InputJsonObject,
      },
      select: { id: true },
    });

    await tx.salesCommunication.create({
      data: {
        opportunityId: sale.id,
        body: [
          `Sent CRM sale ${sale.id} to Spruce via Zapier.`,
          externalJobId ? `Spruce job ID: ${externalJobId}` : null,
          `CRM sale URL: ${mapped.payload.crm_sale_url}`,
        ]
          .filter(Boolean)
          .join("\n"),
        channel: "SYSTEM",
        contactId: sale.contactId,
        direction: "INTERNAL",
        externalId: `${spruceOutboundSendExternalIdPrefix}${sale.id}:${now.getTime()}`,
        metadata: {
          externalJobId,
          externalLinkId: link.id,
          outboundWriteBackApprovedByUserId: userId,
          provider: spruceProvider,
          source: spruceManualSaleSendSource,
        } satisfies Prisma.InputJsonObject,
        occurredAt: now,
        subject: "Sent to Spruce",
        summary: externalJobId
          ? `Sent to Spruce job ${externalJobId}.`
          : "Sent to Spruce via Zapier. Waiting for returned job ID.",
      },
      select: { id: true },
    });

    return { recordsWritten: 2 };
  });

  await writeSpruceOutboundSyncLog({
    connectionId: connection.id,
    message: externalJobId
      ? `Manual CRM sale send to Spruce completed for job ${externalJobId}.`
      : "Manual CRM sale send to Spruce completed via Zapier. No Spruce job ID was returned.",
    metadata: {
      externalJobId,
      externalType,
      responseShape: outboundResponse.responseShape,
      saleId,
    },
    recordsWritten: 1,
    startedAt: now,
    status: "SUCCESS",
  });

  return {
    externalJobId,
    message: externalJobId
      ? `Sent to Spruce job ${externalJobId}.`
      : "Sent to Spruce via Zapier. No Spruce job ID was returned yet.",
    ok: true,
    recordsWritten: writeResult.recordsWritten,
    saleId,
    status: "sent",
  };
}

function mapSaleToSpruceOutboundPayload({
  crmBaseUrl,
  now,
  sale,
}: {
  crmBaseUrl: string;
  now: Date;
  sale: SpruceOutboundSaleRecord;
}) {
  const addressRecord = sale.contact ?? sale.company;
  const address = compactAddress(addressRecord);
  const postcode = cleanText(addressRecord?.postcode);
  const contact = sale.contact;
  const email = cleanText(contact?.email);
  const phone = cleanText(contact?.phone);
  const warnings: string[] = [];
  const crmSaleUrl = new URL(`/sales/${sale.id}`, crmBaseUrl).href;

  if (!contact) {
    warnings.push("Link a customer contact before sending this sale to Spruce.");
  }

  if (!email && !phone) {
    warnings.push(
      "Add a customer email address or phone number before sending this sale to Spruce.",
    );
  }

  if (!address) {
    warnings.push("Add a property address before sending this sale to Spruce.");
  }

  if (!postcode) {
    warnings.push("Add a postcode before sending this sale to Spruce.");
  }

  const customerNotes = [
    `CRM sale ID: ${sale.id}`,
    `CRM sale URL: ${crmSaleUrl}`,
    `Sale title: ${sale.title}`,
    `Stage: ${sale.stage}`,
    sale.source ? `Source: ${sale.source}` : null,
    sale.nextStep ? `Next step: ${sale.nextStep}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    payload: {
      event: "crm.sale.send_to_spruce",
      crm_sale_id: sale.id,
      crm_sale_url: crmSaleUrl,
      homeowner_first_name: cleanText(contact?.firstName),
      homeowner_last_name: cleanText(contact?.lastName),
      homeowner_email: email,
      homeowner_phone: phone,
      address,
      postcode,
      customer_notes: customerNotes,
      status: sale.stage,
      sale_title: sale.title,
      sale_source: sale.source,
      sale_value_cents: sale.valueCents,
      sale_currency: sale.currency,
      sent_at: now.toISOString(),
    },
    warnings,
  };
}

async function postSpruceOutboundWebhook({
  payload,
  secret,
  target,
}: {
  payload: Record<string, unknown>;
  secret: string | null;
  target: URL;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), outboundRequestTimeoutMs);

  try {
    const response = await fetch(target, {
      body: JSON.stringify(payload),
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      method: "POST",
      signal: controller.signal,
    });
    const text = await response.text();
    const json = parseJsonObject(text);

    return {
      externalJobId: extractExternalJobId(json),
      ok: response.ok,
      responseShape: responseShape(json),
      statusCode: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function writeSpruceOutboundSyncLog({
  connectionId,
  message,
  metadata,
  recordsWritten,
  startedAt,
  status,
}: {
  connectionId: string;
  message: string;
  metadata: Prisma.InputJsonObject;
  recordsWritten: number;
  startedAt: Date;
  status: "SUCCESS" | "WARNING" | "ERROR";
}) {
  await prisma.marketingIntegrationSyncLog.create({
    data: {
      finishedAt: new Date(),
      integrationId: connectionId,
      message,
      metadata: {
        ...metadata,
        inboundOnly: false,
        manualOutbound: true,
        outboundWriteBackApproved: true,
      },
      provider: spruceProvider,
      recordsRead: 1,
      recordsWritten,
      startedAt,
      status,
      syncType: spruceManualSaleSendSyncType,
    },
  });
}

function compactAddress(
  entity:
    | {
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        county: string | null;
        postcode: string | null;
        country: string | null;
      }
    | null
    | undefined,
) {
  if (!entity) return null;

  return (
    [
      entity.addressLine1,
      entity.addressLine2,
      entity.city,
      entity.county,
      entity.postcode,
      entity.country,
    ]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", ") || null
  );
}

function cleanText(value: string | null | undefined) {
  const text = value?.trim();

  return text ? text : null;
}

function safeOutboundUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    return url;
  } catch {
    return null;
  }
}

function parseJsonObject(value: string) {
  if (!value.trim()) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractExternalJobId(value: Record<string, unknown> | null) {
  if (!value) return null;

  const result = objectValue(value.result);
  const data = objectValue(value.data);

  return (
    textValue(value.job_id) ??
    textValue(value.jobId) ??
    textValue(value.result_entity_id) ??
    textValue(value.resultEntityId) ??
    textValue(result.job_id) ??
    textValue(result.jobId) ??
    textValue(result.entity_id) ??
    textValue(result.entityId) ??
    textValue(data.job_id) ??
    textValue(data.jobId) ??
    null
  );
}

function responseShape(value: Record<string, unknown> | null) {
  if (!value) return { responseType: "empty-or-non-json" };

  return {
    responseKeys: Object.keys(value).sort().slice(0, 30),
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}
