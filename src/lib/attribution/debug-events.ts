import { Prisma } from "@prisma/client";
import { requestIpAddress, requestLocation } from "@/lib/attribution/http";
import {
  parseAttributionPayload,
  type AttributionSnapshotData,
} from "@/lib/attribution/tracking";
import { prisma } from "@/lib/prisma";

type DebugLevel = "info" | "warning" | "error";

type DebugEventInput = {
  eventType: string;
  level?: DebugLevel;
  message?: string | null;
  hostname?: string | null;
  origin?: string | null;
  path?: string | null;
  attribution?: unknown;
  attributionSnapshotId?: string | null;
  metadata?: unknown;
};

function normaliseHostname(value: string | null | undefined) {
  if (!value) return null;

  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/:?#]/)[0] || null;
  }
}

function requestOrigin(request: Request) {
  return request.headers.get("origin") || request.headers.get("referer");
}

function requestPath(request: Request) {
  const referer = request.headers.get("referer");

  if (referer) {
    try {
      return new URL(referer).pathname;
    } catch {
      return null;
    }
  }

  return null;
}

function attributionIds(attribution: AttributionSnapshotData) {
  return {
    visitorId: attribution.visitorId,
    sessionId: attribution.sessionId,
  };
}

function jsonSafe(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return { value: String(value) };
  }
}

function metadataWithLocation(metadata: unknown, location: unknown) {
  if (!location) {
    return metadata;
  }

  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return {
      ...(metadata as Record<string, unknown>),
      requestLocation: location,
    };
  }

  if (metadata === null || metadata === undefined) {
    return { requestLocation: location };
  }

  return {
    value: metadata,
    requestLocation: location,
  };
}

export async function logAttributionDebugEvent(
  request: Request,
  input: DebugEventInput,
) {
  const origin = input.origin ?? requestOrigin(request);
  const attribution = parseAttributionPayload(input.attribution ?? {});
  const ids = attributionIds(attribution);
  const location = await requestLocation(request).catch((error) => {
    console.error("Failed to resolve attribution request location", error);
    return null;
  });

  try {
    const event = await prisma.attributionDebugEvent.create({
      data: {
        eventType: input.eventType.slice(0, 80),
        level: input.level ?? "info",
        message: input.message ? input.message.slice(0, 500) : null,
        hostname: normaliseHostname(input.hostname ?? origin),
        origin: origin ? origin.slice(0, 2048) : null,
        path: input.path ?? requestPath(request),
        visitorId: ids.visitorId,
        sessionId: ids.sessionId,
        attributionSnapshotId: input.attributionSnapshotId ?? null,
        metadata:
          jsonSafe(metadataWithLocation(input.metadata, location)) ?? Prisma.JsonNull,
        userAgent: request.headers.get("user-agent"),
        ipAddress: requestIpAddress(request),
      },
    });

    if (event.eventType === "script.ready" && event.hostname) {
      await prisma.attributionDomain
        .updateMany({
          where: { domain: event.hostname },
          data: { lastScriptSeenAt: event.createdAt },
        })
        .catch(() => null);
    }

    return event;
  } catch (error) {
    if (!isMissingAttributionDebugEventTable(error)) {
      throw error;
    }

    return null;
  }
}

export function isMissingAttributionDebugEventTable(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "AttributionDebugEvent" ||
        candidate.meta?.table?.includes("AttributionDebugEvent"))) ||
    (candidate.code === "P2022" &&
      candidate.meta?.modelName === "AttributionDebugEvent")
  );
}
