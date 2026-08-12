import { attributionJsonResponse, attributionOptionsResponse } from "@/lib/attribution/http";
import { logAttributionDebugEvent } from "@/lib/attribution/debug-events";
import { attributionQueryParams } from "@/lib/attribution/tracking";
import {
  cachedAttributionDomainAccess,
  requestAttributionHostname,
  type AttributionDomainAccess,
} from "@/lib/attribution/domain-access";
import { appBaseUrlFromRequest } from "@/lib/http/origin";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";

export async function OPTIONS(request: Request) {
  return attributionOptionsResponse(request);
}

export async function GET(request: Request) {
  const hostname = requestAttributionHostname(request);
  const [settings, domainAccess] = await Promise.all([
    getCrmSettings(),
    cachedAttributionDomainAccess(hostname),
  ]);
  const enabled = settings.attributionTrackingEnabled && domainAccess.enabled;
  const trackingEnabled =
    enabled && (domainAccess.overrides?.trackingEnabled ?? settings.attributionTrackingEnabled);
  const formTrackingEnabled =
    trackingEnabled &&
    (domainAccess.overrides?.formTrackingEnabled ?? settings.attributionFormTrackingEnabled);
  const phoneTrackingEnabled =
    trackingEnabled &&
    (domainAccess.overrides?.phoneTrackingEnabled ?? settings.attributionPhoneTrackingEnabled);
  const visibleReplacementEnabled =
    phoneTrackingEnabled &&
    (domainAccess.overrides?.visibleNumberReplacementEnabled ??
      settings.attributionReplaceVisibleNumbersEnabled);
  const consentRequired =
    domainAccess.overrides?.consentRequired ?? settings.attributionRequireConsent;
  const publicDomainAccess = {
    hostname: domainAccess.hostname,
    registered: domainAccess.registered,
    enabled: domainAccess.enabled,
    reason: domainAccess.reason,
    overrides: domainAccess.overrides,
  };

  await recordConfigRequest(request, domainAccess, enabled, trackingEnabled, publicDomainAccess)
    .catch((error) => {
      console.error("Failed to record attribution config request", error);
    });

  return attributionJsonResponse(request, {
    ok: true,
    enabled,
    apiBase: appBaseUrlFromRequest(request),
    domain: publicDomainAccess,
    queryParams: attributionQueryParams,
    phone: {
      autoDetect: phoneTrackingEnabled,
      replaceTelLinks: phoneTrackingEnabled && settings.attributionReplaceTelLinksEnabled,
      replaceVisibleNumbers: visibleReplacementEnabled,
    },
    forms: {
      autoTrack: formTrackingEnabled,
      injectHiddenField: formTrackingEnabled && settings.attributionInjectHiddenFieldEnabled,
      hiddenFieldName: "crm_attribution",
    },
    consent: {
      required: consentRequired,
      storageKey: "id30_tracking_consent",
      prompt: consentPromptConfig(
        settings.attributionConsentRequirements,
        consentRequired,
      ),
    },
    session: {
      assignmentWindowMinutes: settings.attributionSessionTimeoutMinutes,
      timelineLimit: settings.attributionTimelineLimit,
      captureReferrer: settings.attributionCaptureReferrerEnabled,
    },
  });
}

function consentPromptConfig(value: unknown, consentRequired: boolean) {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const enabled = consentRequired && record.consentPromptEnabled === true;

  return {
    enabled,
    title: stringOrDefault(
      record.consentPromptTitle,
      "Can we use cookies?",
      80,
    ),
    message: stringOrDefault(
      record.consentPromptMessage,
      "We use cookies and similar technologies to improve your experience, understand site performance and measure marketing activity.",
      240,
    ),
    acceptLabel: stringOrDefault(record.consentPromptAcceptLabel, "Accept", 40),
    declineLabel: stringOrDefault(record.consentPromptDeclineLabel, "Decline", 40),
    privacyUrl: privacyUrlOrNull(record.consentPromptPrivacyUrl),
    placement: placementOrDefault(record.consentPromptPlacement),
    theme: themeOrDefault(record.consentPromptTheme),
    maxWidth: numberOrDefault(record.consentPromptMaxWidth, 480, 320, 720),
    borderRadius: numberOrDefault(record.consentPromptBorderRadius, 12, 0, 32),
    backgroundColor: hexColorOrNull(record.consentPromptBackgroundColor),
    textColor: hexColorOrNull(record.consentPromptTextColor),
    mutedTextColor: hexColorOrNull(record.consentPromptMutedTextColor),
    borderColor: hexColorOrNull(record.consentPromptBorderColor),
    buttonBackgroundColor: hexColorOrNull(record.consentPromptButtonBackgroundColor),
    buttonTextColor: hexColorOrNull(record.consentPromptButtonTextColor),
    linkColor: hexColorOrNull(record.consentPromptLinkColor),
  };
}

function stringOrDefault(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : fallback;
}

function privacyUrlOrNull(value: unknown) {
  if (typeof value !== "string") return null;

  const url = value.trim();
  return url && (url.startsWith("/") || /^https?:\/\//i.test(url)) ? url : null;
}

function placementOrDefault(value: unknown) {
  return typeof value === "string" &&
    [
      "bottom-left",
      "bottom-center",
      "bottom-right",
      "top-left",
      "top-center",
      "top-right",
    ].includes(value)
    ? value
    : "bottom-left";
}

function themeOrDefault(value: unknown) {
  return typeof value === "string" && ["light", "dark", "auto", "custom"].includes(value)
    ? value
    : "light";
}

function numberOrDefault(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);

  return Number.isInteger(numberValue) && numberValue >= min && numberValue <= max
    ? numberValue
    : fallback;
}

function hexColorOrNull(value: unknown) {
  if (typeof value !== "string") return null;

  const color = value.trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : null;
}

async function recordConfigRequest(
  request: Request,
  domainAccess: AttributionDomainAccess,
  enabled: boolean,
  trackingEnabled: boolean,
  publicDomainAccess: {
    hostname: string | null;
    registered: boolean;
    enabled: boolean;
    reason: string;
    overrides: unknown;
  },
) {
  if (!shouldRecordConfigRequest(domainAccess, enabled)) {
    return;
  }

  if (domainAccess.domainId) {
    await prisma.attributionDomain
      .update({
        where: { id: domainAccess.domainId },
        data: { lastConfigRequestAt: new Date() },
      })
      .catch(() => null);
  }

  await logAttributionDebugEvent(request, {
    eventType: "config.request",
    level: enabled ? "info" : "warning",
    message: enabled
      ? "Config endpoint returned enabled tracking."
      : "Config endpoint returned disabled tracking.",
    hostname: domainAccess.hostname,
    metadata: {
      enabled: trackingEnabled,
      reason: publicDomainAccess.reason,
      registered: publicDomainAccess.registered,
    },
  });
}

function shouldRecordConfigRequest(
  domainAccess: AttributionDomainAccess,
  enabled: boolean,
) {
  if (!enabled) return true;
  if (process.env.ATTRIBUTION_LOG_CONFIG_REQUESTS === "true") return true;
  if (!domainAccess.domainId) return false;
  if (!domainAccess.lastConfigRequestAt) return true;

  return Date.now() - domainAccess.lastConfigRequestAt.getTime() > 15 * 60 * 1000;
}
