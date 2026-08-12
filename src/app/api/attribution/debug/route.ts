import { z } from "zod";
import {
  attributionRequestErrorResponse,
  attributionJsonResponse,
  attributionOptionsResponse,
  readAttributionRequestPayload,
  requireAttributionDomainAccess,
} from "@/lib/attribution/http";
import { logAttributionDebugEvent } from "@/lib/attribution/debug-events";

const debugPayloadLimitBytes = 64 * 1024;

const debugEventSchema = z
  .object({
    eventType: z.string().trim().min(1).max(80),
    level: z.enum(["info", "warning", "error"]).optional(),
    message: z.string().trim().max(500).optional(),
    hostname: z.string().trim().max(255).optional(),
    origin: z.string().trim().max(2048).optional(),
    path: z.string().trim().max(2048).optional(),
    attribution: z.unknown().optional(),
    metadata: z.unknown().optional(),
  })
  .passthrough();

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
    payload = await readAttributionRequestPayload(request, {
      maxBytes: debugPayloadLimitBytes,
    });
  } catch (error) {
    return attributionRequestErrorResponse(request, error);
  }

  const parsed = debugEventSchema.safeParse(payload);

  if (!parsed.success) {
    return attributionJsonResponse(
      request,
      { error: parsed.error.issues[0]?.message ?? "Invalid debug event." },
      { status: 400 },
    );
  }

  const event = await logAttributionDebugEvent(request, {
    eventType: parsed.data.eventType,
    level: parsed.data.level,
    message: parsed.data.message,
    hostname: parsed.data.hostname,
    origin: parsed.data.origin,
    path: parsed.data.path,
    attribution: parsed.data.attribution,
    metadata: parsed.data.metadata,
  });

  return attributionJsonResponse(request, {
    ok: true,
    eventId: event?.id ?? null,
  });
}
