import "server-only";

import type { Prisma } from "@prisma/client";
import { getGeoapifyRuntimeConfig } from "@/lib/integrations/geoapify";
import type {
  SpruceBuiltForm,
  SpruceFuelType,
  SpruceLoftInsulation,
  SprucePropertyType,
  SpruceWallType,
  SpruceWindowType,
} from "@/lib/integrations/spruce-job-fields";
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
const geoapifyRequestTimeoutMs = 5000;
const outboundRequestTimeoutMs = 15000;

type SpruceOutboundSaleRecord = Prisma.SalesOpportunityGetPayload<{
  select: typeof spruceOutboundSaleSelect;
}>;

export type SpruceDirectJobInput = {
  builtForm: SpruceBuiltForm;
  floorAreaM2: number;
  fuelType: SpruceFuelType;
  latitude: number | null;
  loftInsulation: SpruceLoftInsulation;
  longitude: number | null;
  numBedrooms: number;
  propertyType: SprucePropertyType;
  wallType: SpruceWallType;
  windowType: SpruceWindowType;
};

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
  directJobInput = null,
  now = new Date(),
  saleId,
  userId,
}: {
  crmBaseUrl: string;
  directJobInput?: SpruceDirectJobInput | null;
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

  const crmSaleUrl = new URL(`/sales/${sale.id}`, crmBaseUrl).href;

  if (runtimeConfig.apiKey) {
    return sendSalesOpportunityToSpruceDirectApi({
      apiBaseUrl: runtimeConfig.apiBaseUrl,
      apiKey: runtimeConfig.apiKey,
      connectionId: connection.id,
      crmSaleUrl,
      directJobInput,
      now,
      sale,
      saleId,
      userId,
    });
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
        "Add a Spruce API key or outbound Zapier webhook URL in Settings > Integrations > Spruce before sending sales.",
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
          `CRM sale URL: ${crmSaleUrl}`,
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

async function sendSalesOpportunityToSpruceDirectApi({
  apiBaseUrl,
  apiKey,
  connectionId,
  crmSaleUrl,
  directJobInput,
  now,
  sale,
  saleId,
  userId,
}: {
  apiBaseUrl: string;
  apiKey: string;
  connectionId: string;
  crmSaleUrl: string;
  directJobInput: SpruceDirectJobInput | null;
  now: Date;
  sale: SpruceOutboundSaleRecord;
  saleId: string;
  userId: string;
}): Promise<SpruceSaleOutboundResult> {
  const mapped = await mapSaleToSpruceDirectJobPayload({
    directJobInput,
    sale,
  });

  if (mapped.warnings.length || !mapped.payload) {
    await writeSpruceOutboundSyncLog({
      connectionId,
      message: `Manual CRM sale send to Spruce skipped: ${mapped.warnings.join(" ")}`,
      metadata: {
        reason: "missing-required-spruce-job-data",
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

  let authResponse: Awaited<ReturnType<typeof authenticateSpruceApi>>;

  try {
    authResponse = await authenticateSpruceApi({
      apiBaseUrl,
      apiKey,
    });
  } catch (error) {
    await writeSpruceOutboundSyncLog({
      connectionId,
      message: "Manual CRM sale send to Spruce failed before API authentication responded.",
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
      message: "Spruce API did not respond during authentication.",
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  if (!authResponse.ok || !authResponse.token) {
    await writeSpruceOutboundSyncLog({
      connectionId,
      message: `Manual CRM sale send to Spruce API authentication failed with HTTP ${authResponse.statusCode}.`,
      metadata: {
        responseShape: authResponse.responseShape,
        responseStatus: authResponse.statusCode,
        saleId,
      },
      recordsWritten: 0,
      startedAt: now,
      status: "ERROR",
    });

    return {
      externalJobId: null,
      message:
        authResponse.statusCode === 401 || authResponse.statusCode === 403
          ? "Spruce API rejected the saved API key."
          : "Spruce API authentication failed. Check Spruce sync history for the HTTP status.",
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  let createResponse: Awaited<ReturnType<typeof createSpruceJob>>;

  try {
    createResponse = await createSpruceJob({
      apiBaseUrl,
      payload: mapped.payload,
      token: authResponse.token,
    });
  } catch (error) {
    await writeSpruceOutboundSyncLog({
      connectionId,
      message: "Manual CRM sale send to Spruce failed before the create-job API responded.",
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
      message: "Spruce API did not respond while creating the job.",
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  if (!createResponse.ok || !createResponse.jobId) {
    await writeSpruceOutboundSyncLog({
      connectionId,
      message: `Manual CRM sale send to Spruce create-job failed with HTTP ${createResponse.statusCode}.`,
      metadata: {
        responseShape: createResponse.responseShape,
        responseStatus: createResponse.statusCode,
        saleId,
      },
      recordsWritten: 0,
      startedAt: now,
      status: "ERROR",
    });

    return {
      externalJobId: null,
      message:
        createResponse.statusCode === 409
          ? "Spruce already has a job using this CRM sale reference."
          : "Spruce API did not create the job. Check Spruce sync history for the HTTP status.",
      ok: false,
      recordsWritten: 0,
      saleId,
      status: "error",
    };
  }

  const jobId = createResponse.jobId;
  const jobUrl = createResponse.jobUrl;

  const writeResult = await prisma.$transaction(async (tx) => {
    const link = await tx.externalRecordLink.upsert({
      where: {
        provider_externalType_externalId: {
          externalId: jobId,
          externalType: spruceJobExternalType,
          provider: spruceProvider,
        },
      },
      create: {
        externalId: jobId,
        externalType: spruceJobExternalType,
        integrationId: connectionId,
        internalId: sale.id,
        internalType: spruceSalesOpportunityInternalType,
        lastSeenAt: now,
        metadata: {
          crmSaleId: sale.id,
          externalJobId: jobId,
          externalJobUrl: jobUrl,
          outboundWriteBackApprovedByUserId: userId,
          provider: spruceProvider,
          source: "spruce-api-manual-sale-send",
        } satisfies Prisma.InputJsonObject,
        provider: spruceProvider,
      },
      update: {
        integrationId: connectionId,
        internalId: sale.id,
        internalType: spruceSalesOpportunityInternalType,
        lastSeenAt: now,
        metadata: {
          crmSaleId: sale.id,
          externalJobId: jobId,
          externalJobUrl: jobUrl,
          outboundWriteBackApprovedByUserId: userId,
          provider: spruceProvider,
          source: "spruce-api-manual-sale-send",
        } satisfies Prisma.InputJsonObject,
      },
      select: { id: true },
    });

    await tx.salesCommunication.create({
      data: {
        opportunityId: sale.id,
        body: [
          `Created Spruce job ${jobId} from CRM sale ${sale.id}.`,
          jobUrl ? `Spruce job URL: ${jobUrl}` : null,
          `CRM sale URL: ${crmSaleUrl}`,
        ]
          .filter(Boolean)
          .join("\n"),
        channel: "SYSTEM",
        contactId: sale.contactId,
        direction: "INTERNAL",
        externalId: `${spruceOutboundSendExternalIdPrefix}${sale.id}:${now.getTime()}`,
        metadata: {
          externalJobId: jobId,
          externalJobUrl: jobUrl,
          externalLinkId: link.id,
          outboundWriteBackApprovedByUserId: userId,
          provider: spruceProvider,
          source: "spruce-api-manual-sale-send",
        } satisfies Prisma.InputJsonObject,
        occurredAt: now,
        subject: "Sent to Spruce",
        summary: `Created Spruce job ${jobId}.`,
      },
      select: { id: true },
    });

    return { recordsWritten: 2 };
  });

  await writeSpruceOutboundSyncLog({
    connectionId,
    message: `Manual CRM sale send to Spruce completed for job ${jobId}.`,
    metadata: {
      externalJobId: jobId,
      externalJobUrl: jobUrl,
      externalType: spruceJobExternalType,
      responseShape: createResponse.responseShape,
      saleId,
      transport: "direct-api",
    },
    recordsWritten: 1,
    startedAt: now,
    status: "SUCCESS",
  });

  return {
    externalJobId: jobId,
    message: `Created Spruce job ${jobId}.`,
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

async function mapSaleToSpruceDirectJobPayload({
  directJobInput,
  sale,
}: {
  directJobInput: SpruceDirectJobInput | null;
  sale: SpruceOutboundSaleRecord;
}) {
  const addressRecord = sale.contact ?? sale.company;
  const address = compactPropertyAddress(addressRecord);
  const postcode = cleanText(addressRecord?.postcode);
  const contact = sale.contact;
  const firstName = cleanText(contact?.firstName);
  const lastName = cleanText(contact?.lastName);
  const email = cleanText(contact?.email);
  const phone = cleanText(contact?.phone);
  const warnings: string[] = [];

  if (!directJobInput) {
    warnings.push("Complete the Spruce property details before creating the job.");
  }

  if (!contact) {
    warnings.push("Link a customer contact before sending this sale to Spruce.");
  }

  if (!firstName) {
    warnings.push("Add the customer's first name before sending this sale to Spruce.");
  }

  if (!lastName) {
    warnings.push("Add the customer's last name before sending this sale to Spruce.");
  }

  if (!email) {
    warnings.push("Add the customer's email address before sending this sale to Spruce.");
  }

  if (!phone) {
    warnings.push("Add the customer's phone number before sending this sale to Spruce.");
  }

  if (!address) {
    warnings.push("Add a property address before sending this sale to Spruce.");
  }

  if (!postcode) {
    warnings.push("Add a postcode before sending this sale to Spruce.");
  }

  if (!directJobInput || !address || !postcode || !firstName || !lastName || !email || !phone) {
    return { payload: null, warnings };
  }

  const latLng =
    directJobInput.latitude !== null && directJobInput.longitude !== null
      ? [directJobInput.latitude, directJobInput.longitude]
      : await geocodeSpruceJobAddress({ address, postcode });

  if (!latLng) {
    warnings.push(
      "Add latitude and longitude, or configure Geoapify so CRM can geocode the property address.",
    );
    return { payload: null, warnings };
  }

  return {
    payload: {
      address,
      built_form: directJobInput.builtForm,
      customer_email: email,
      customer_first_name: firstName,
      customer_last_name: lastName,
      customer_phone: phone,
      floor_area_m2: directJobInput.floorAreaM2,
      fuel_type: directJobInput.fuelType,
      job_name: sale.title,
      job_reference: `CRM-${sale.id}`,
      lat_lng: latLng,
      loft_insulation: directJobInput.loftInsulation,
      num_bedrooms: directJobInput.numBedrooms,
      postcode,
      property_type: directJobInput.propertyType,
      source: sale.source || "CRM",
      tags: ["CRM", "EPC Improvements"],
      wall_type: directJobInput.wallType,
      window_type: directJobInput.windowType,
    },
    warnings,
  };
}

async function geocodeSpruceJobAddress({
  address,
  postcode,
}: {
  address: string;
  postcode: string;
}) {
  const runtimeConfig = await getGeoapifyRuntimeConfig({
    workspaceCountry: "GB",
  });

  if (!runtimeConfig.apiKey) return null;

  const lookupUrl = new URL("https://api.geoapify.com/v1/geocode/search");
  lookupUrl.searchParams.set("text", `${address}, ${postcode}`.slice(0, 180));
  lookupUrl.searchParams.set("format", "json");
  lookupUrl.searchParams.set("limit", "1");
  lookupUrl.searchParams.set("lang", runtimeConfig.language || "en");
  if (runtimeConfig.countryFilter && /^[A-Z]{2}$/.test(runtimeConfig.countryFilter)) {
    lookupUrl.searchParams.set(
      "filter",
      `countrycode:${runtimeConfig.countryFilter.toLowerCase()}`,
    );
  }
  lookupUrl.searchParams.set("apiKey", runtimeConfig.apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), geoapifyRequestTimeoutMs);

  try {
    const response = await fetch(lookupUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      results?: Array<{ lat?: unknown; lon?: unknown }>;
    } | null;
    const result = response.ok ? payload?.results?.[0] : null;
    const lat = typeof result?.lat === "number" ? result.lat : null;
    const lng = typeof result?.lon === "number" ? result.lon : null;

    return lat !== null && lng !== null ? [lat, lng] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticateSpruceApi({
  apiBaseUrl,
  apiKey,
}: {
  apiBaseUrl: string;
  apiKey: string;
}) {
  const response = await postJson({
    body: { api_key: apiKey },
    headers: {},
    target: new URL("/v1/auth", apiBaseUrl),
  });

  return {
    ...response,
    token: textValue(response.json?.token),
  };
}

async function createSpruceJob({
  apiBaseUrl,
  payload,
  token,
}: {
  apiBaseUrl: string;
  payload: Record<string, unknown>;
  token: string;
}) {
  const response = await postJson({
    body: payload,
    headers: { authorization: `Bearer ${token}` },
    target: new URL("/v1/jobs", apiBaseUrl),
  });

  return {
    ...response,
    jobId: textValue(response.json?.uuid),
    jobUrl: textValue(response.json?.url),
  };
}

async function postJson({
  body,
  headers,
  target,
}: {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  target: URL;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), outboundRequestTimeoutMs);

  try {
    const response = await fetch(target, {
      body: JSON.stringify(body),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "content-type": "application/json",
        ...headers,
      },
      method: "POST",
      signal: controller.signal,
    });
    const text = await response.text();
    const json = parseJsonObject(text);

    return {
      json,
      ok: response.ok,
      responseShape: responseShape(json),
      statusCode: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
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

function compactPropertyAddress(
  entity:
    | {
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        county: string | null;
      }
    | null
    | undefined,
) {
  if (!entity) return null;

  return (
    [entity.addressLine1, entity.addressLine2, entity.city, entity.county]
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
