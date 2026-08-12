import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export type AttributionDomainAccess = {
  domainId: string | null;
  lastConfigRequestAt: Date | null;
  overrides: {
    trackingEnabled: boolean | null;
    consentRequired: boolean | null;
    formTrackingEnabled: boolean | null;
    phoneTrackingEnabled: boolean | null;
    visibleNumberReplacementEnabled: boolean | null;
  } | null;
  hostname: string | null;
  registered: boolean;
  enabled: boolean;
  reason: string;
};

export function normaliseAttributionHostname(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return (
      value
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split(/[/:?#]/)[0] || null
    );
  }
}

export function requestAttributionHostname(request: Request) {
  const origin = normaliseAttributionHostname(request.headers.get("origin"));
  const referer = normaliseAttributionHostname(request.headers.get("referer"));

  if (origin && referer && origin !== referer) {
    return null;
  }

  return origin || referer;
}

export function cachedAttributionDomainAccess(hostname: string | null) {
  return unstable_cache(
    () => resolveAttributionDomainAccess(hostname),
    ["attribution-domain-access", hostname ?? "unknown"],
    { revalidate: 60 },
  )();
}

export async function attributionDomainAccessForRequest(request: Request) {
  return cachedAttributionDomainAccess(requestAttributionHostname(request));
}

export async function resolveAttributionDomainAccess(
  hostname: string | null,
): Promise<AttributionDomainAccess> {
  try {
    if (!hostname) {
      const registeredDomains = await prisma.attributionDomain.count();

      return {
        domainId: null,
        lastConfigRequestAt: null,
        overrides: null,
        hostname: null,
        registered: false,
        enabled: false,
        reason:
          registeredDomains === 0
            ? "unknown-origin-registry-empty"
            : "unknown-origin",
      };
    }

    const [domain, registeredDomains] = await Promise.all([
      prisma.attributionDomain.findUnique({ where: { domain: hostname } }),
      prisma.attributionDomain.count(),
    ]);

    if (domain) {
      return {
        domainId: domain.id,
        lastConfigRequestAt: domain.lastConfigRequestAt,
        overrides: {
          trackingEnabled: domain.trackingEnabled,
          consentRequired: domain.consentRequired,
          formTrackingEnabled: domain.formTrackingEnabled,
          phoneTrackingEnabled: domain.phoneTrackingEnabled,
          visibleNumberReplacementEnabled: domain.visibleNumberReplacementEnabled,
        },
        hostname,
        registered: true,
        enabled: domain.isActive,
        reason: domain.isActive ? "active-domain" : "inactive-domain",
      };
    }

    const emptyRegistryLocalHost =
      registeredDomains === 0 && isLocalHostname(hostname);

    return {
      domainId: null,
      lastConfigRequestAt: null,
      overrides: null,
      hostname,
      registered: false,
      enabled: emptyRegistryLocalHost,
      reason:
        registeredDomains === 0
          ? isLocalHostname(hostname)
            ? "local-development-registry-empty"
            : "registry-empty"
          : isLocalHostname(hostname)
            ? "unregistered-local-domain"
            : "unregistered-domain",
    };
  } catch (error) {
    if (!isMissingAttributionDomainTable(error)) {
      throw error;
    }

    return {
      domainId: null,
      lastConfigRequestAt: null,
      overrides: null,
      hostname,
      registered: false,
      enabled: false,
      reason: "domain-registry-unavailable",
    };
  }
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isMissingAttributionDomainTable(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "AttributionDomain" ||
        candidate.meta?.table?.includes("AttributionDomain"))) ||
    (candidate.code === "P2022" && candidate.meta?.modelName === "AttributionDomain")
  );
}
