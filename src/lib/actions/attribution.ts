"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import twilio from "twilio";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto/secrets";
import { twilioProvider, twilioStoredConfigSchema } from "@/lib/integrations/twilio";
import { normalizeCallableNumber } from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";

type AvailableTrackingNumber = {
  phoneNumber: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  numberType: TrackingNumberType;
  addressRequirements: string | null;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
};

export type NumberSearchState = {
  ok: boolean;
  message: string;
  numbers: AvailableTrackingNumber[];
};

export type NumberPoolActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
  pendingCompliance?: TwilioBundleComplianceStatus | null;
};

export type NumberPoolGenerationState = NumberPoolActionState & {
  purchasedNumbers: string[];
};

type TwilioAddressOption = {
  sid: string;
  label: string;
  country: string;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  street: string | null;
  validated: boolean;
  verified: boolean;
};

type TwilioRegulatoryBundleOption = {
  sid: string;
  label: string;
  country: string | null;
  status: string;
  numberType: string;
  regulationSid: string;
  validUntil: string | null;
};

type ApprovedTwilioBundle = TwilioRegulatoryBundleOption & {
  country: string;
};

type PreparedComplianceBundle = {
  sid: string;
  status: string;
  message: string;
  country: string;
  numberType: string;
};

export type TwilioBundleComplianceStatus = {
  bundleSid: string;
  country: string;
  numberType: string;
  status: string;
  message: string;
  checkedAt: number;
};

class TwilioCompliancePendingError extends Error {
  pendingCompliance: TwilioBundleComplianceStatus;

  constructor(pendingCompliance: TwilioBundleComplianceStatus) {
    super(pendingCompliance.message);
    this.name = "TwilioCompliancePendingError";
    this.pendingCompliance = pendingCompliance;
  }
}

export type TwilioAddressSearchState = {
  ok: boolean;
  message: string;
  addresses: TwilioAddressOption[];
};

export type TwilioRegulatoryBundleSearchState = {
  ok: boolean;
  message: string;
  bundles: TwilioRegulatoryBundleOption[];
};

const trackingNumberTypes = ["local", "national", "mobile", "tollFree"] as const;
const trackingNumberSearchTypes = ["any", ...trackingNumberTypes] as const;
type TrackingNumberType = (typeof trackingNumberTypes)[number];
type TrackingNumberSearchType = (typeof trackingNumberSearchTypes)[number];

type TwilioAvailableNumberRecord = {
  phoneNumber: string;
  friendlyName?: string | null;
  locality?: string | null;
  region?: string | null;
  isoCountry?: string | null;
  addressRequirements?: string | null;
  capabilities?: {
    voice?: boolean;
    sms?: boolean;
    mms?: boolean;
  } | null;
};

type TrackingNumberSearchInput = {
  country: string;
  areaCode?: number;
  contains?: string;
  numberType: TrackingNumberSearchType;
};

const searchSchema = z.object({
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  numberType: z
    .enum(trackingNumberSearchTypes)
    .optional()
    .catch("any")
    .transform((value) => value ?? "any"),
  areaCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      const parsed = Number(value);
      return value && Number.isFinite(parsed) ? parsed : undefined;
    }),
  contains: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length >= 2 ? value : undefined)),
});

const purchaseSchema = z.object({
  phoneNumber: z.string().trim().min(5),
  label: z.string().trim().optional().transform((value) => value || undefined),
  country: z
    .string()
    .trim()
    .length(2)
    .optional()
    .transform((value) => value?.toUpperCase()),
  numberType: z.enum(trackingNumberTypes).optional(),
  addressSid: z.string().trim().optional().transform((value) => value || undefined),
  bundleSid: z.string().trim().optional().transform((value) => value || undefined),
});

const generatePoolSchema = searchSchema.extend({
  quantity: z
    .string()
    .trim()
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(10)),
  label: z.string().trim().optional().transform((value) => value || undefined),
  addressSid: z.string().trim().optional().transform((value) => value || undefined),
  bundleSid: z.string().trim().optional().transform((value) => value || undefined),
});

const deactivateSchema = z.object({
  id: z.string().trim().min(1),
});

const releaseTrackingNumberSchema = z.object({
  id: z.string().trim().min(1),
  confirmationNumber: z.string().trim().min(5),
});

const trackingPoolLabelSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null);

const updateTrackingPoolSchema = z.object({
  poolLabel: trackingPoolLabelSchema,
  label: z.string().trim().min(2, "Enter a pool name."),
  destinationNumber: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? normalizeCallableNumber(value) : null)),
  routeAsLabel: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
});

const deleteTrackingPoolSchema = z.object({
  poolLabel: trackingPoolLabelSchema,
});

const bundleStatusSchema = z.object({
  bundleSid: z.string().trim().min(1),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  numberType: z.enum(trackingNumberTypes),
});

const addressSearchSchema = z.object({
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
});

const bundleSearchSchema = z.object({
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  numberType: z
    .enum(trackingNumberSearchTypes)
    .optional()
    .catch("local")
    .transform((value) => value ?? "local"),
});

function revalidateAttributionPaths() {
  revalidatePath("/settings/attribution");
  revalidatePath("/telephony/call-tracking");
  revalidatePath("/telephony/call-tracking/overview");
  revalidatePath("/marketing");
}

function poolWhere(label: string | null) {
  return label ? { label } : { label: null };
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function twilioApiErrorMessage(error: unknown) {
  const candidate = error as {
    code?: number | string;
    message?: string;
    status?: number;
  };

  if (candidate?.message) {
    const code = candidate.code ? ` (${candidate.code})` : "";
    return `${candidate.message}${code}`;
  }

  return "Twilio rejected the request.";
}

function searchTypes(numberType: TrackingNumberSearchType): TrackingNumberType[] {
  return numberType === "any" ? [...trackingNumberTypes] : [numberType];
}

function numberTypeLabel(numberType: TrackingNumberType) {
  if (numberType === "tollFree") return "Toll-free";
  return numberType[0].toUpperCase() + numberType.slice(1);
}

function regulatoryBundleNumberTypes(numberType: TrackingNumberSearchType): string[] {
  if (numberType === "tollFree") return ["toll-free"];
  if (numberType === "any") return ["local", "national", "mobile", "toll-free"];
  return [numberType];
}

function exactRegulatoryBundleNumberType(numberType: TrackingNumberType) {
  return numberType === "tollFree" ? "toll-free" : numberType;
}

function mapAvailableTrackingNumber(
  number: TwilioAvailableNumberRecord,
  numberType: TrackingNumberType,
  country: string,
): AvailableTrackingNumber {
  return {
    phoneNumber: number.phoneNumber,
    friendlyName: number.friendlyName ?? null,
    locality: number.locality ?? null,
    region: number.region ?? null,
    country: number.isoCountry ?? country,
    numberType,
    addressRequirements:
      "addressRequirements" in number && typeof number.addressRequirements === "string"
        ? number.addressRequirements
        : null,
    capabilities: {
      voice: Boolean(number.capabilities?.voice),
      sms: Boolean(number.capabilities?.sms),
      mms: Boolean(number.capabilities?.mms),
    },
  };
}

function normalizedNonNanpPrefix(areaCode?: number) {
  if (!areaCode) return undefined;
  const prefix = String(areaCode).replace(/^0+/, "");
  return prefix.length >= 2 ? prefix : undefined;
}

async function listAvailableTrackingNumbers(
  client: ReturnType<typeof twilio>,
  search: TrackingNumberSearchInput,
  limit: number,
) {
  const availablePhoneNumbers = client.availablePhoneNumbers(search.country);
  const numbers: AvailableTrackingNumber[] = [];
  const seen = new Set<string>();
  const isNanp = search.country === "US" || search.country === "CA";
  const areaCode = isNanp ? search.areaCode : undefined;
  const contains = search.contains ?? normalizedNonNanpPrefix(search.areaCode);

  for (const numberType of searchTypes(search.numberType)) {
    if (numbers.length >= limit) break;

    const options = {
      areaCode: numberType === "tollFree" ? undefined : areaCode,
      contains,
      voiceEnabled: true,
      limit: limit - numbers.length,
    };

    try {
      const listed =
        numberType === "local"
          ? await availablePhoneNumbers.local.list(options)
          : numberType === "national"
            ? await availablePhoneNumbers.national.list(options)
            : numberType === "mobile"
              ? await availablePhoneNumbers.mobile.list(options)
              : await availablePhoneNumbers.tollFree.list(options);

      for (const number of listed) {
        if (seen.has(number.phoneNumber)) continue;
        seen.add(number.phoneNumber);
        numbers.push(mapAvailableTrackingNumber(number, numberType, search.country));
      }
    } catch {
      // Some countries do not expose every Twilio number category. Keep searching
      // the remaining categories so "Any voice number" can still find inventory.
    }
  }

  return numbers;
}

function isBundleRegulationError(error: unknown) {
  const candidate = error as { code?: number | string; message?: string };

  return (
    String(candidate?.code) === "21649" ||
    Boolean(candidate?.message?.toLowerCase().includes("bundle"))
  );
}

function evaluationViolations(results: unknown) {
  if (!Array.isArray(results)) return "";

  return results
    .map((item) => metadataRecord(item))
    .map((item) => {
      const friendlyName = typeof item.friendly_name === "string" ? item.friendly_name : null;
      const description = typeof item.description === "string" ? item.description : null;
      return [friendlyName, description].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .slice(0, 3)
    .join("; ");
}

async function approvedBundlesForNumberType({
  client,
  country,
  numberType,
}: {
  client: ReturnType<typeof twilio>;
  country: string;
  numberType: TrackingNumberType;
}) {
  const regulatoryNumberType = exactRegulatoryBundleNumberType(numberType);
  const regulationSids: string[] = [];

  for (const endUserType of ["business", "individual"] as const) {
    try {
      const regulations = await client.numbers.v2.regulatoryCompliance.regulations.list({
        endUserType,
        isoCountry: country,
        numberType: regulatoryNumberType,
        limit: 10,
      });
      regulationSids.push(...regulations.map((regulation) => regulation.sid));
    } catch {
      // Try the next end-user type.
    }
  }

  const bundleResults = await Promise.all(
    regulationSids.map(async (regulationSid) => {
      try {
        const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list({
          regulationSid,
          status: "twilio-approved",
          limit: 25,
        });

        return bundles.map((bundle) => ({
          country,
          label: bundle.friendlyName || bundle.sid,
          numberType: regulatoryNumberType,
          regulationSid: bundle.regulationSid,
          sid: bundle.sid,
          status: bundle.status,
          validUntil: bundle.validUntil ? bundle.validUntil.toISOString() : null,
        }));
      } catch {
        return [];
      }
    }),
  );
  const bundles = bundleResults.flat().filter((bundle) =>
    regulationSids.includes(bundle.regulationSid),
  );

  if (bundles.length) {
    await syncApprovedTwilioBundles(bundles);
  }

  return bundles;
}

async function targetRegulationForNumberType({
  client,
  country,
  numberType,
}: {
  client: ReturnType<typeof twilio>;
  country: string;
  numberType: TrackingNumberType;
}) {
  const regulatoryNumberType = exactRegulatoryBundleNumberType(numberType);

  for (const endUserType of ["business", "individual"] as const) {
    try {
      const regulations = await client.numbers.v2.regulatoryCompliance.regulations.list({
        endUserType,
        isoCountry: country,
        numberType: regulatoryNumberType,
        limit: 10,
      });
      const regulation = regulations[0];

      if (regulation) {
        return {
          endUserType,
          friendlyName: regulation.friendlyName,
          numberType: regulatoryNumberType,
          sid: regulation.sid,
        };
      }
    } catch {
      // Try the next end-user type.
    }
  }

  return null;
}

async function findBundleWithAssignments({
  client,
  preferredBundleSid,
}: {
  client: ReturnType<typeof twilio>;
  preferredBundleSid?: string;
}) {
  const candidateSids: string[] = [];

  if (preferredBundleSid) {
    candidateSids.push(preferredBundleSid);
  }

  const approvedBundles = await client.numbers.v2.regulatoryCompliance.bundles.list({
    status: "twilio-approved",
    limit: 50,
  });

  for (const bundle of approvedBundles) {
    if (!candidateSids.includes(bundle.sid)) {
      candidateSids.push(bundle.sid);
    }
  }

  for (const sid of candidateSids) {
    try {
      const bundle = await client.numbers.v2.regulatoryCompliance.bundles(sid).fetch();
      const assignments = await client.numbers.v2.regulatoryCompliance
        .bundles(sid)
        .itemAssignments.list({ limit: 50 });

      if (assignments.length) {
        return { bundle, assignments };
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

async function prepareComplianceBundleForNumberType({
  client,
  country,
  numberType,
  sourceBundleSid,
}: {
  client: ReturnType<typeof twilio>;
  country: string;
  numberType: TrackingNumberType;
  sourceBundleSid?: string;
}): Promise<PreparedComplianceBundle | null> {
  const regulation = await targetRegulationForNumberType({ client, country, numberType });

  if (!regulation) {
    return null;
  }

  const existingBundles = await client.numbers.v2.regulatoryCompliance.bundles.list({
    regulationSid: regulation.sid,
    limit: 20,
  });
  const approved = existingBundles.find(
    (bundle) => bundle.status === "twilio-approved" || bundle.status === "provisionally-approved",
  );

  if (approved) {
    return {
      country,
      numberType,
      sid: approved.sid,
      status: approved.status,
      message: `Approved ${country} ${numberType} bundle ${approved.sid} is available.`,
    };
  }

  const inProgress = existingBundles.find((bundle) =>
    ["draft", "pending-review", "in-review"].includes(bundle.status),
  );

  if (inProgress && inProgress.status !== "draft") {
    return {
      country,
      numberType,
      sid: inProgress.sid,
      status: inProgress.status,
      message: `${country} ${numberType} bundle ${inProgress.sid} is already ${inProgress.status}. Wait for Twilio approval, then retry the number purchase.`,
    };
  }

  const source = await findBundleWithAssignments({ client, preferredBundleSid: sourceBundleSid });

  if (!source) {
    throw new Error(
      `No existing Twilio bundle with reusable end-user/document assignments was found. Create a ${country} ${numberType} compliance bundle in Twilio first.`,
    );
  }

  const targetBundle =
    inProgress ??
    (await client.numbers.v2.regulatoryCompliance.bundles.create({
      email: source.bundle.email,
      friendlyName: `${regulation.friendlyName} - copied from ${source.bundle.sid}`,
      regulationSid: regulation.sid,
    }));

  const existingAssignments = inProgress
    ? await client.numbers.v2.regulatoryCompliance
        .bundles(targetBundle.sid)
        .itemAssignments.list({ limit: 50 })
    : [];
  const assignedObjectSids = new Set(existingAssignments.map((assignment) => assignment.objectSid));

  for (const assignment of source.assignments) {
    if (assignedObjectSids.has(assignment.objectSid)) continue;

    await client.numbers.v2.regulatoryCompliance
      .bundles(targetBundle.sid)
      .itemAssignments.create({ objectSid: assignment.objectSid });
  }

  const evaluation = await client.numbers.v2.regulatoryCompliance
    .bundles(targetBundle.sid)
    .evaluations.create();

  if (evaluation.status !== "compliant") {
    const violations = evaluationViolations(evaluation.results);

    throw new Error(
      `${country} ${numberType} bundle ${targetBundle.sid} was created but is not compliant${violations ? `: ${violations}` : "."}`,
    );
  }

  const submitted = await client.numbers.v2.regulatoryCompliance
    .bundles(targetBundle.sid)
    .update({ status: "pending-review" });

  await syncApprovedTwilioBundles([
    {
      country,
      label: submitted.friendlyName || submitted.sid,
      numberType: regulation.numberType,
      regulationSid: submitted.regulationSid,
      sid: submitted.sid,
      status: submitted.status,
      validUntil: submitted.validUntil ? submitted.validUntil.toISOString() : null,
    },
  ]);

  return {
    country,
    numberType,
    sid: submitted.sid,
    status: submitted.status,
    message: `${country} ${numberType} bundle ${submitted.sid} was created from existing Twilio compliance records and submitted for review. Wait for Twilio approval, then retry the number purchase.`,
  };
}

async function syncApprovedTwilioBundles(bundles: ApprovedTwilioBundle[]) {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const parsed = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!connection || !parsed.success || !bundles.length) return;

  const importedInventory = parsed.data.importedInventory ?? {
    lastImportedAt: new Date().toISOString(),
    addresses: [],
    bundles: [],
    messagingServices: [],
    phoneNumbers: [],
  };
  const existingBundles = importedInventory.bundles
    .map((bundle) => metadataRecord(bundle))
    .filter((bundle) => typeof bundle.sid === "string");
  const merged = new Map<string, Record<string, unknown>>();

  for (const bundle of existingBundles) {
    merged.set(String(bundle.sid), bundle);
  }

  for (const bundle of bundles) {
    merged.set(bundle.sid, bundle);
  }

  await prisma.integrationConnection.update({
    where: { provider: twilioProvider },
    data: {
      config: {
        ...parsed.data,
        importedInventory: {
          ...importedInventory,
          lastImportedAt: new Date().toISOString(),
          bundles: Array.from(merged.values()),
        },
      } as Prisma.InputJsonValue,
    },
  });
}

async function createIncomingTrackingNumber({
  addressSid,
  bundleSid,
  client,
  country,
  friendlyName,
  messagingEnabled,
  numberType,
  phoneNumber,
  smsUrl,
  voiceUrl,
}: {
  addressSid?: string;
  bundleSid?: string;
  client: ReturnType<typeof twilio>;
  country?: string | null;
  friendlyName: string;
  messagingEnabled: boolean;
  numberType?: TrackingNumberType;
  phoneNumber: string;
  smsUrl: string;
  voiceUrl: string;
}) {
  const compatibleBundles =
    country && numberType
      ? await approvedBundlesForNumberType({ client, country, numberType })
      : [];
  const compatibleBundleSids = compatibleBundles.map((bundle) => bundle.sid);
  const selectedBundleIsCompatible =
    !bundleSid || !country || !numberType || compatibleBundleSids.includes(bundleSid);

  if (country && numberType && !compatibleBundleSids.length) {
    const prepared = await prepareComplianceBundleForNumberType({
      client,
      country,
      numberType,
      sourceBundleSid: bundleSid,
    });

    if (prepared?.status === "twilio-approved" || prepared?.status === "provisionally-approved") {
      compatibleBundleSids.push(prepared.sid);
    } else {
      throw new TwilioCompliancePendingError({
        bundleSid: prepared?.sid ?? "",
        checkedAt: Date.now(),
        country,
        message:
          prepared?.message ??
          `A matching ${country} ${numberType} compliance bundle must be approved before buying these numbers.`,
        numberType,
        status: prepared?.status ?? "pending-review",
      });
    }
  }

  const candidateBundleSids = Array.from(
    new Set([
      ...compatibleBundleSids,
      selectedBundleIsCompatible ? bundleSid : null,
    ].filter(Boolean)),
  ) as string[];
  const candidates = candidateBundleSids.length ? candidateBundleSids : [undefined];
  let lastError: unknown = null;

  for (const candidateBundleSid of candidates) {
    try {
      const purchased = await client.incomingPhoneNumbers.create({
        phoneNumber,
        friendlyName,
        voiceUrl,
        voiceMethod: "POST",
        ...(addressSid ? { addressSid } : {}),
        ...(candidateBundleSid ? { bundleSid: candidateBundleSid } : {}),
        ...(messagingEnabled ? { smsUrl, smsMethod: "POST" } : {}),
      });

      return {
        bundleSid: candidateBundleSid ?? null,
        purchased,
      };
    } catch (error) {
      lastError = error;

      if (!isBundleRegulationError(error)) {
        break;
      }
    }
  }

  throw lastError;
}

async function twilioNumberRuntime() {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const parsed = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!parsed.success || !parsed.data.credentials?.authToken) {
    throw new Error("Connect Twilio with an Account SID and Auth Token first.");
  }

  if (!parsed.data.capabilities.includes("voice")) {
    throw new Error("Enable Telephony in the Twilio integration first.");
  }

  if (!parsed.data.webhookBaseUrl) {
    throw new Error("Add the Twilio webhook base URL before buying tracking numbers.");
  }

  return {
    accountSid: parsed.data.accountSid,
    authToken: decryptSecret(parsed.data.credentials.authToken),
    webhookBaseUrl: parsed.data.webhookBaseUrl.replace(/\/$/, ""),
    messagingEnabled: parsed.data.capabilities.includes("sms"),
  };
}

export async function listTwilioAddressesAction(
  _: TwilioAddressSearchState,
  formData: FormData,
): Promise<TwilioAddressSearchState> {
  await requireAdmin();

  const parsed = addressSearchSchema.safeParse({ country: formData.get("country") });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Enter a valid two-letter country code.",
      addresses: [],
    };
  }

  try {
    const runtime = await twilioNumberRuntime();
    const client = twilio(runtime.accountSid, runtime.authToken);
    const addresses = await client.addresses.list({
      isoCountry: parsed.data.country,
      limit: 25,
    });

    return {
      ok: true,
      message: addresses.length
        ? `${addresses.length} Twilio address${addresses.length === 1 ? "" : "es"} found.`
        : `No Twilio addresses were found for ${parsed.data.country}. Add one in Twilio, then load addresses again.`,
      addresses: addresses.map((address) => ({
        sid: address.sid,
        label: address.friendlyName || address.customerName || address.sid,
        country: address.isoCountry,
        city: address.city || null,
        region: address.region || null,
        postalCode: address.postalCode || null,
        street: address.street || null,
        validated: Boolean(address.validated),
        verified: Boolean(address.verified),
      })),
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not load Twilio addresses. ${twilioApiErrorMessage(error)}`,
      addresses: [],
    };
  }
}

export async function listTwilioRegulatoryBundlesAction(
  _: TwilioRegulatoryBundleSearchState,
  formData: FormData,
): Promise<TwilioRegulatoryBundleSearchState> {
  await requireAdmin();

  const parsed = bundleSearchSchema.safeParse({
    country: formData.get("country"),
    numberType: formData.get("numberType"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Enter a valid country and number type.",
      bundles: [],
    };
  }

  try {
    const runtime = await twilioNumberRuntime();
    const client = twilio(runtime.accountSid, runtime.authToken);
    const bundleResults = await Promise.all(
      regulatoryBundleNumberTypes(parsed.data.numberType).map(async (numberType) => {
        try {
          const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list({
            isoCountry: parsed.data.country,
            numberType,
            status: "twilio-approved",
            limit: 25,
          });

          return bundles.map((bundle) => ({ bundle, numberType }));
        } catch {
          return [];
        }
      }),
    );
    const bundles = bundleResults.flat();
    const approvedBundles = bundles.map(({ bundle, numberType }) => ({
      country: parsed.data.country,
      label: bundle.friendlyName || bundle.sid,
      numberType,
      regulationSid: bundle.regulationSid,
      sid: bundle.sid,
      status: bundle.status,
      validUntil: bundle.validUntil ? bundle.validUntil.toISOString() : null,
    }));

    if (approvedBundles.length) {
      await syncApprovedTwilioBundles(approvedBundles);
    }

    return {
      ok: true,
      message: bundles.length
        ? `${bundles.length} approved Twilio bundle${bundles.length === 1 ? "" : "s"} found.`
        : `No approved Twilio bundles were found for ${parsed.data.country}. Create and approve a matching bundle in Twilio Regulatory Compliance, then load bundles again.`,
      bundles: approvedBundles,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not load Twilio regulatory bundles. ${twilioApiErrorMessage(error)}`,
      bundles: [],
    };
  }
}

export async function refreshTwilioBundleComplianceStatusAction(
  _: NumberPoolActionState,
  formData: FormData,
): Promise<NumberPoolActionState> {
  await requireAdmin();

  const parsed = bundleStatusSchema.safeParse({
    bundleSid: formData.get("bundleSid"),
    country: formData.get("country"),
    numberType: formData.get("numberType"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Choose a valid Twilio bundle to check.",
      savedAt: null,
    };
  }

  try {
    const runtime = await twilioNumberRuntime();
    const client = twilio(runtime.accountSid, runtime.authToken);
    const bundle = await client.numbers.v2.regulatoryCompliance
      .bundles(parsed.data.bundleSid)
      .fetch();
    const approved =
      bundle.status === "twilio-approved" || bundle.status === "provisionally-approved";
    const message = approved
      ? `${parsed.data.country} ${parsed.data.numberType} bundle ${bundle.sid} is approved. Retry the number purchase.`
      : `${parsed.data.country} ${parsed.data.numberType} bundle ${bundle.sid} is ${bundle.status}. The CRM will keep checking.`;

    await syncApprovedTwilioBundles([
      {
        country: parsed.data.country,
        label: bundle.friendlyName || bundle.sid,
        numberType: exactRegulatoryBundleNumberType(parsed.data.numberType),
        regulationSid: bundle.regulationSid,
        sid: bundle.sid,
        status: bundle.status,
        validUntil: bundle.validUntil ? bundle.validUntil.toISOString() : null,
      },
    ]);
    revalidateAttributionPaths();

    return {
      ok: true,
      message,
      pendingCompliance: approved
        ? null
        : {
            bundleSid: bundle.sid,
            checkedAt: Date.now(),
            country: parsed.data.country,
            message,
            numberType: parsed.data.numberType,
            status: bundle.status,
          },
      savedAt: Date.now(),
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not check Twilio bundle status. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
    };
  }
}

export async function searchTwilioTrackingNumbersAction(
  _: NumberSearchState,
  formData: FormData,
): Promise<NumberSearchState> {
  await requireAdmin();

  const parsed = searchSchema.safeParse({
    country: formData.get("country"),
    numberType: formData.get("numberType"),
    areaCode: formData.get("areaCode"),
    contains: formData.get("contains"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter a valid number search.",
      numbers: [],
    };
  }

  try {
    const runtime = await twilioNumberRuntime();
    const client = twilio(runtime.accountSid, runtime.authToken);
    const numbers = await listAvailableTrackingNumbers(client, parsed.data, 12);

    return {
      ok: true,
      message: numbers.length
        ? `${numbers.length} available Twilio numbers found.`
        : "No matching voice-capable numbers were found. Try Any voice number, remove the area code/pattern, or choose a country with available Twilio inventory.",
      numbers,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `Could not search Twilio numbers. ${twilioApiErrorMessage(error)}`,
      numbers: [],
    };
  }
}

export async function purchaseTwilioTrackingNumberAction(
  _: NumberPoolActionState,
  formData: FormData,
): Promise<NumberPoolActionState> {
  await requireAdmin();

  const parsed = purchaseSchema.safeParse({
    phoneNumber: formData.get("phoneNumber"),
    label: formData.get("label"),
    country: formData.get("country"),
    numberType: formData.get("numberType"),
    addressSid: formData.get("addressSid"),
    bundleSid: formData.get("bundleSid"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Choose a valid Twilio number.",
      savedAt: null,
    };
  }

  try {
    const runtime = await twilioNumberRuntime();
    const client = twilio(runtime.accountSid, runtime.authToken);
    const voiceUrl = `${runtime.webhookBaseUrl}/api/webhooks/twilio/voice`;
    const smsUrl = `${runtime.webhookBaseUrl}/api/webhooks/twilio/messaging`;
    const { bundleSid, purchased } = await createIncomingTrackingNumber({
      addressSid: parsed.data.addressSid,
      bundleSid: parsed.data.bundleSid,
      client,
      country: parsed.data.country,
      friendlyName: parsed.data.label || "iD30 CRM attribution tracking",
      messagingEnabled: runtime.messagingEnabled,
      numberType: parsed.data.numberType,
      phoneNumber: parsed.data.phoneNumber,
      smsUrl,
      voiceUrl,
    });
    const phoneNumber = normalizeCallableNumber(purchased.phoneNumber);

    await prisma.attributionPhoneNumber.upsert({
      where: { phoneNumber },
      update: {
        label: parsed.data.label ?? purchased.friendlyName ?? "Tracking number",
        isActive: true,
        metadata: {
          provider: "twilio",
          twilioPhoneNumberSid: purchased.sid,
          capabilities: purchased.capabilities ?? {},
          country: null,
          locality: null,
          region: null,
          voiceUrl,
          smsUrl: runtime.messagingEnabled ? smsUrl : null,
          addressSid: parsed.data.addressSid ?? null,
          bundleSid,
          purchasedAt: new Date().toISOString(),
        },
      },
      create: {
        phoneNumber,
        label: parsed.data.label ?? purchased.friendlyName ?? "Tracking number",
        isActive: true,
        metadata: {
          provider: "twilio",
          twilioPhoneNumberSid: purchased.sid,
          capabilities: purchased.capabilities ?? {},
          country: null,
          locality: null,
          region: null,
          voiceUrl,
          smsUrl: runtime.messagingEnabled ? smsUrl : null,
          addressSid: parsed.data.addressSid ?? null,
          bundleSid,
          purchasedAt: new Date().toISOString(),
        },
      },
    });

    revalidateAttributionPaths();

    return {
      ok: true,
      message: `${phoneNumber} was bought in Twilio and added to the attribution pool.`,
      savedAt: Date.now(),
    };
  } catch (error) {
    if (error instanceof TwilioCompliancePendingError) {
      return {
        ok: true,
        message: error.pendingCompliance.message,
        pendingCompliance: error.pendingCompliance,
        savedAt: Date.now(),
      };
    }

    return {
      ok: false,
      message: `Could not buy that Twilio number. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
    };
  }
}

export async function generateTwilioTrackingNumberPoolAction(
  _: NumberPoolGenerationState,
  formData: FormData,
): Promise<NumberPoolGenerationState> {
  await requireAdmin();

  const parsed = generatePoolSchema.safeParse({
    country: formData.get("country"),
    numberType: formData.get("numberType"),
    areaCode: formData.get("areaCode"),
    contains: formData.get("contains"),
    quantity: formData.get("quantity"),
    label: formData.get("label"),
    addressSid: formData.get("addressSid"),
    bundleSid: formData.get("bundleSid"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter valid pool details.",
      savedAt: null,
      purchasedNumbers: [],
    };
  }

  try {
    const runtime = await twilioNumberRuntime();
    const client = twilio(runtime.accountSid, runtime.authToken);
    const voiceUrl = `${runtime.webhookBaseUrl}/api/webhooks/twilio/voice`;
    const smsUrl = `${runtime.webhookBaseUrl}/api/webhooks/twilio/messaging`;
    const availableNumbers = await listAvailableTrackingNumbers(
      client,
      parsed.data,
      parsed.data.quantity,
    );

    if (!availableNumbers.length) {
      return {
        ok: false,
        message:
          "No matching voice-capable Twilio numbers were found. Try Any voice number, remove the area code/pattern, or choose a country with available Twilio inventory.",
        savedAt: null,
        purchasedNumbers: [],
      };
    }

    const purchasedNumbers: string[] = [];
    const failedNumbers: string[] = [];
    const failureMessages = new Set<string>();
    let pendingCompliance: TwilioBundleComplianceStatus | null = null;

    for (const [index, number] of availableNumbers.entries()) {
      try {
        const label =
          parsed.data.label ||
          `Tracking pool ${parsed.data.country}${parsed.data.areaCode ? ` ${parsed.data.areaCode}` : ""}`;
        const { bundleSid, purchased } = await createIncomingTrackingNumber({
          addressSid: parsed.data.addressSid,
          bundleSid: parsed.data.bundleSid,
          client,
          country: number.country ?? parsed.data.country,
          friendlyName: `${label} ${numberTypeLabel(number.numberType)} ${index + 1}`,
          messagingEnabled: runtime.messagingEnabled,
          numberType: number.numberType,
          phoneNumber: number.phoneNumber,
          smsUrl,
          voiceUrl,
        });
        const phoneNumber = normalizeCallableNumber(purchased.phoneNumber);

        await prisma.attributionPhoneNumber.upsert({
          where: { phoneNumber },
          update: {
            label,
            isActive: true,
            metadata: {
              provider: "twilio",
              twilioPhoneNumberSid: purchased.sid,
              capabilities: purchased.capabilities ?? {},
              country: number.country ?? parsed.data.country,
              locality: number.locality ?? null,
              region: number.region ?? null,
              numberType: number.numberType,
              addressRequirements: number.addressRequirements,
              voiceUrl,
              smsUrl: runtime.messagingEnabled ? smsUrl : null,
              addressSid: parsed.data.addressSid ?? null,
              bundleSid,
              purchasedAt: new Date().toISOString(),
              generatedPool: true,
            },
          },
          create: {
            phoneNumber,
            label,
            isActive: true,
            metadata: {
              provider: "twilio",
              twilioPhoneNumberSid: purchased.sid,
              capabilities: purchased.capabilities ?? {},
              country: number.country ?? parsed.data.country,
              locality: number.locality ?? null,
              region: number.region ?? null,
              numberType: number.numberType,
              addressRequirements: number.addressRequirements,
              voiceUrl,
              smsUrl: runtime.messagingEnabled ? smsUrl : null,
              addressSid: parsed.data.addressSid ?? null,
              bundleSid,
              purchasedAt: new Date().toISOString(),
              generatedPool: true,
            },
          },
        });

        purchasedNumbers.push(phoneNumber);
      } catch (error) {
        if (error instanceof TwilioCompliancePendingError) {
          pendingCompliance = error.pendingCompliance;
          break;
        }

        failedNumbers.push(number.phoneNumber);
        failureMessages.add(twilioApiErrorMessage(error));
      }
    }

    revalidateAttributionPaths();

    if (pendingCompliance && !purchasedNumbers.length) {
      return {
        ok: true,
        message: pendingCompliance.message,
        pendingCompliance,
        purchasedNumbers: [],
        savedAt: Date.now(),
      };
    }

    if (!purchasedNumbers.length) {
      return {
        ok: false,
        message: `Twilio found numbers, but none could be purchased. ${Array.from(failureMessages)[0] ?? "Try a different area code or pattern."}`,
        savedAt: null,
        purchasedNumbers: [],
      };
    }

    return {
      ok: failedNumbers.length === 0,
      message: failedNumbers.length
        ? `${purchasedNumbers.length} numbers added. ${failedNumbers.length} could not be purchased. ${Array.from(failureMessages)[0] ?? ""}`.trim()
        : `${purchasedNumbers.length} tracking numbers were bought in Twilio and added to the CRM pool.`,
      savedAt: Date.now(),
      purchasedNumbers,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not generate that number pool. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
      purchasedNumbers: [],
    };
  }
}

export async function activateImportedAttributionNumberAction(
  _: NumberPoolActionState,
  formData: FormData,
): Promise<NumberPoolActionState> {
  await requireAdmin();

  const parsed = deactivateSchema.safeParse({ id: formData.get("id") });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Choose a valid imported Twilio number.",
      savedAt: null,
    };
  }

  try {
    const number = await prisma.attributionPhoneNumber.findUnique({
      where: { id: parsed.data.id },
    });

    if (!number) {
      return {
        ok: false,
        message: "That imported Twilio number could not be found.",
        savedAt: null,
      };
    }

    const metadata =
      number.metadata && typeof number.metadata === "object" && !Array.isArray(number.metadata)
        ? (number.metadata as Record<string, unknown>)
        : {};
    const twilioPhoneNumberSid =
      typeof metadata.twilioPhoneNumberSid === "string" ? metadata.twilioPhoneNumberSid : null;

    if (!twilioPhoneNumberSid) {
      return {
        ok: false,
        message: "This number is missing its Twilio SID. Re-run Import from Twilio, then try again.",
        savedAt: null,
      };
    }

    const runtime = await twilioNumberRuntime();
    const client = twilio(runtime.accountSid, runtime.authToken);
    const voiceUrl = `${runtime.webhookBaseUrl}/api/webhooks/twilio/voice`;
    const smsUrl = `${runtime.webhookBaseUrl}/api/webhooks/twilio/messaging`;

    await client.incomingPhoneNumbers(twilioPhoneNumberSid).update({
      voiceUrl,
      voiceMethod: "POST",
      ...(runtime.messagingEnabled ? { smsUrl, smsMethod: "POST" } : {}),
    });

    await prisma.attributionPhoneNumber.update({
      where: { id: number.id },
      data: {
        isActive: true,
        metadata: {
          ...metadata,
          provider: "twilio",
          twilioPhoneNumberSid,
          voiceUrl,
          smsUrl: runtime.messagingEnabled ? smsUrl : null,
          activatedAt: new Date().toISOString(),
        },
      },
    });

    revalidateAttributionPaths();

    return {
      ok: true,
      message: `${number.phoneNumber} is now active in the tracking pool and Twilio webhooks were updated.`,
      savedAt: Date.now(),
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not activate that Twilio number. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
    };
  }
}

export async function deactivateAttributionNumberAction(
  _: NumberPoolActionState,
  formData: FormData,
): Promise<NumberPoolActionState> {
  await requireAdmin();

  const parsed = deactivateSchema.safeParse({ id: formData.get("id") });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Choose a valid tracking number.",
      savedAt: null,
    };
  }

  await prisma.attributionPhoneNumber.update({
    where: { id: parsed.data.id },
    data: { isActive: false },
  });
  revalidateAttributionPaths();

  return {
    ok: true,
    message: "Tracking number removed from the active CRM pool. It was not released from Twilio.",
    savedAt: Date.now(),
  };
}

export async function releaseAttributionNumberFromTwilioAction(
  _: NumberPoolActionState,
  formData: FormData,
): Promise<NumberPoolActionState> {
  await requireAdmin();

  const parsed = releaseTrackingNumberSchema.safeParse({
    id: formData.get("id"),
    confirmationNumber: formData.get("confirmationNumber"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Confirm the tracking number to release.",
      savedAt: null,
    };
  }

  const number = await prisma.attributionPhoneNumber.findUnique({
    where: { id: parsed.data.id },
    include: {
      _count: {
        select: {
          assignments: {
            where: { expiresAt: { gt: new Date() } },
          },
        },
      },
    },
  });

  if (!number) {
    return {
      ok: false,
      message: "Tracking number not found.",
      savedAt: null,
    };
  }

  if (normalizeCallableNumber(parsed.data.confirmationNumber) !== number.phoneNumber) {
    return {
      ok: false,
      message: "Type the full phone number exactly to confirm release.",
      savedAt: null,
    };
  }

  if (number.isActive) {
    return {
      ok: false,
      message: "Remove this number from the active tracking pool before releasing it from Twilio.",
      savedAt: null,
    };
  }

  if (number._count.assignments > 0) {
    return {
      ok: false,
      message: "This number still has live visitor assignments. Wait for them to expire before releasing it from Twilio.",
      savedAt: null,
    };
  }

  const metadata = metadataRecord(number.metadata);
  const twilioPhoneNumberSid = recordString(metadata.twilioPhoneNumberSid);

  if (!twilioPhoneNumberSid) {
    return {
      ok: false,
      message: "This tracking number is missing its Twilio SID. Re-run Import from Twilio before releasing it.",
      savedAt: null,
    };
  }

  if (metadata.releasedFromTwilio === true) {
    return {
      ok: true,
      message: `${number.phoneNumber} is already marked as released from Twilio.`,
      savedAt: Date.now(),
    };
  }

  try {
    const connection = await prisma.integrationConnection.findUnique({
      where: { provider: twilioProvider },
    });
    const config = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

    if (!config.success || !config.data.credentials?.authToken) {
      return {
        ok: false,
        message: "Save the Twilio Account SID and Auth Token first.",
        savedAt: null,
      };
    }

    const authToken = decryptSecret(config.data.credentials.authToken);
    const client = twilio(config.data.accountSid, authToken);
    await client.incomingPhoneNumbers(twilioPhoneNumberSid).remove();

    const nextImportedPhoneNumbers =
      config.success && config.data.importedInventory
        ? config.data.importedInventory.phoneNumbers.filter((inventoryNumber) => {
            const record = metadataRecord(inventoryNumber);

            return (
              recordString(record.sid) !== twilioPhoneNumberSid &&
              normalizeCallableNumber(recordString(record.phoneNumber) ?? "") !== number.phoneNumber
            );
          })
        : null;
    const releasedAt = new Date().toISOString();
    const releaseMetadata = {
      ...metadata,
      releasedFromTwilio: true,
      releasedAt,
    };

    await prisma.$transaction([
      prisma.attributionPhoneNumber.update({
        where: { id: number.id },
        data: {
          isActive: false,
          metadata: releaseMetadata as Prisma.InputJsonValue,
        },
      }),
      ...(config.success && config.data.importedInventory && nextImportedPhoneNumbers
        ? [
            prisma.integrationConnection.update({
              where: { provider: twilioProvider },
              data: {
                config: {
                  ...config.data,
                  importedInventory: {
                    ...config.data.importedInventory,
                    lastImportedAt: releasedAt,
                    phoneNumbers: nextImportedPhoneNumbers,
                  },
                } as Prisma.InputJsonValue,
              },
            }),
          ]
        : []),
    ]);

    revalidateAttributionPaths();
    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");

    return {
      ok: true,
      message: `${number.phoneNumber} was released from Twilio. Future Twilio number rental charges should stop, but the number is no longer owned.`,
      savedAt: Date.now(),
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not release that tracking number. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
    };
  }
}

export async function updateTrackingPoolAction(
  _: NumberPoolActionState,
  formData: FormData,
): Promise<NumberPoolActionState> {
  await requireAdmin();

  const parsed = updateTrackingPoolSchema.safeParse({
    poolLabel: formData.get("poolLabel"),
    label: formData.get("label"),
    destinationNumber: formData.get("destinationNumber"),
    routeAsLabel: formData.get("routeAsLabel"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter valid pool details.",
      savedAt: null,
    };
  }

  const numbers = await prisma.attributionPhoneNumber.findMany({
    where: poolWhere(parsed.data.poolLabel),
  });

  if (!numbers.length) {
    return {
      ok: false,
      message: "That tracking pool could not be found.",
      savedAt: null,
    };
  }

  await prisma.$transaction(
    numbers.map((number) =>
      prisma.attributionPhoneNumber.update({
        where: { id: number.id },
        data: {
          label: parsed.data.label,
          destinationNumber: parsed.data.destinationNumber,
          metadata: {
            ...metadataRecord(number.metadata),
            routeAsLabel: parsed.data.routeAsLabel,
            updatedAsPoolAt: new Date().toISOString(),
          },
        },
      }),
    ),
  );

  revalidateAttributionPaths();

  return {
    ok: true,
    message: `${numbers.length} tracking number${numbers.length === 1 ? "" : "s"} updated in ${parsed.data.label}.`,
    savedAt: Date.now(),
  };
}

export async function deleteTrackingPoolAction(
  _: NumberPoolActionState,
  formData: FormData,
): Promise<NumberPoolActionState> {
  await requireAdmin();

  const parsed = deleteTrackingPoolSchema.safeParse({
    poolLabel: formData.get("poolLabel"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Choose a valid tracking pool.",
      savedAt: null,
    };
  }

  const result = await prisma.attributionPhoneNumber.updateMany({
    where: poolWhere(parsed.data.poolLabel),
    data: { isActive: false },
  });

  revalidateAttributionPaths();

  return {
    ok: true,
    message: `${result.count} tracking number${result.count === 1 ? "" : "s"} archived. Twilio numbers were not released.`,
    savedAt: Date.now(),
  };
}
