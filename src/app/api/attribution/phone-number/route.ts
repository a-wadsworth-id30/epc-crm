import { twilioProvider, twilioStoredConfigSchema } from "@/lib/integrations/twilio";
import { prisma } from "@/lib/prisma";
import {
  assignTrackingPhoneNumber,
  parseAttributionPayload,
} from "@/lib/attribution/tracking";
import { logAttributionDebugEvent } from "@/lib/attribution/debug-events";
import {
  attributionRequestErrorResponse,
  attributionJsonResponse,
  attributionOptionsResponse,
  readAttributionRequestPayload,
  requestIpAddress,
  requestLocation,
  requireAttributionDomainAccess,
} from "@/lib/attribution/http";

const phonePayloadLimitBytes = 64 * 1024;

async function fallbackPhoneNumber() {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const parsed = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (parsed.success && parsed.data.voiceCallerId) {
    return parsed.data.voiceCallerId;
  }

  return process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER ?? null;
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

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "1";
}

export async function OPTIONS(request: Request) {
  return attributionOptionsResponse(request);
}

export async function POST(request: Request) {
  const domainAccess = await requireAttributionDomainAccess(request);

  if (!domainAccess.ok) {
    return domainAccess.response;
  }

  let payload: Record<string, unknown>;

  try {
    const parsedPayload = await readAttributionRequestPayload(request, {
      maxBytes: phonePayloadLimitBytes,
    });
    payload =
      parsedPayload && typeof parsedPayload === "object" && !Array.isArray(parsedPayload)
        ? (parsedPayload as Record<string, unknown>)
        : {};
  } catch (error) {
    return attributionRequestErrorResponse(request, error);
  }

  const rawAttribution = payload.attribution ?? payload.crm_attribution ?? payload;
  const attribution = parsePossiblyStringifiedAttribution(rawAttribution);
  const displayOnly = booleanValue(payload.displayOnly);
  const location = await requestLocation(request);
  const assignment = await assignTrackingPhoneNumber({
    attribution,
    displayOnly,
    userAgent: request.headers.get("user-agent"),
    ipAddress: requestIpAddress(request),
    location,
  });
  const fallback = await fallbackPhoneNumber();

  await logAttributionDebugEvent(request, {
    eventType: assignment.phoneNumber
      ? displayOnly
        ? "phone.display"
        : "phone.assigned"
      : "phone.fallback",
    level: assignment.phoneNumber ? "info" : "warning",
    message: assignment.phoneNumber
      ? displayOnly
        ? "Tracking phone number returned for display-only replacement."
        : "Tracking phone number assigned."
      : "Fallback phone number returned.",
    attribution,
    attributionSnapshotId: assignment.snapshotId,
    metadata: {
      assignmentId: assignment.assignmentId,
      displayOnly,
      trackingPhoneNumber: assignment.phoneNumber,
      dniRule: assignment.dniRule,
      fallbackPhoneNumber: fallback,
      requestLocation: location,
    },
  });

  return attributionJsonResponse(request, {
    ok: true,
    phoneNumber: assignment.phoneNumber ?? fallback,
    trackingPhoneNumber: assignment.phoneNumber,
    fallbackPhoneNumber: fallback,
    assignmentId: assignment.assignmentId,
    displayOnly,
    dniRule: assignment.dniRule,
    dniRuleId: assignment.dniRule.ruleId,
    dniRuleName: assignment.dniRule.ruleName,
    dniPoolLabel: assignment.dniRule.poolLabel,
    dniFallbackReason: assignment.dniRule.fallbackReason,
  });
}

export async function GET(request: Request) {
  const domainAccess = await requireAttributionDomainAccess(request);

  if (!domainAccess.ok) {
    return domainAccess.response;
  }

  const url = new URL(request.url);
  const attribution = parseAttributionPayload({
    visitorId: url.searchParams.get("visitorId") ?? undefined,
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    currentPage: url.searchParams.get("currentPage") ?? undefined,
    landingPage: url.searchParams.get("landingPage") ?? undefined,
    referrer: url.searchParams.get("referrer") ?? undefined,
  });
  const location = await requestLocation(request);
  const assignment = await assignTrackingPhoneNumber({
    attribution,
    userAgent: request.headers.get("user-agent"),
    ipAddress: requestIpAddress(request),
    location,
  });
  const fallback = await fallbackPhoneNumber();

  await logAttributionDebugEvent(request, {
    eventType: assignment.phoneNumber ? "phone.assigned" : "phone.fallback",
    level: assignment.phoneNumber ? "info" : "warning",
    message: assignment.phoneNumber
      ? "Tracking phone number assigned."
      : "Fallback phone number returned.",
    attribution,
    attributionSnapshotId: assignment.snapshotId,
    metadata: {
      assignmentId: assignment.assignmentId,
      trackingPhoneNumber: assignment.phoneNumber,
      dniRule: assignment.dniRule,
      fallbackPhoneNumber: fallback,
      requestLocation: location,
    },
  });

  return attributionJsonResponse(request, {
    ok: true,
    phoneNumber: assignment.phoneNumber ?? fallback,
    trackingPhoneNumber: assignment.phoneNumber,
    fallbackPhoneNumber: fallback,
    assignmentId: assignment.assignmentId,
    dniRule: assignment.dniRule,
    dniRuleId: assignment.dniRule.ruleId,
    dniRuleName: assignment.dniRule.ruleName,
    dniPoolLabel: assignment.dniRule.poolLabel,
    dniFallbackReason: assignment.dniRule.fallbackReason,
  });
}
