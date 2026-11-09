import crypto from "node:crypto";
import { z } from "zod";
import { id30AuthIdentifierSchema } from "@/lib/integrations/id30-auth-identifiers";

export const gmailPushPayloadSchema = z.object({
  event: z.literal("gmail.history.available"),
  version: z.literal(1),
  connectionId: z.string().trim().min(1).max(160),
  crmConnectionId: z.string().trim().min(1).max(160).nullable().optional(),
  crmClientId: id30AuthIdentifierSchema,
  workspaceId: id30AuthIdentifierSchema,
  provider: z.literal("gmail"),
  historyId: z.string().regex(/^\d+$/).max(40),
  messageId: z.string().trim().min(1).max(200),
  publishTime: z.string().datetime().optional(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type GmailPushPayload = z.infer<typeof gmailPushPayloadSchema>;

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tokenSegments(body: unknown) {
  const objectBody = jsonObject(body);
  const token =
    typeof body === "string" ? body.trim() : stringValue(objectBody.token);
  if (!token) return null;

  const segments = token.split(".");
  return segments.length === 2 && segments[0] && segments[1]
    ? { payloadSegment: segments[0], signatureSegment: segments[1] }
    : null;
}

function signaturesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function timestampError(payload: GmailPushPayload, now: Date) {
  const nowMs = now.getTime();
  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);

  if (issuedAt > nowMs + 60_000) return "Signed Gmail event was issued in the future.";
  if (expiresAt <= nowMs) return "Signed Gmail event has expired.";
  if (expiresAt - issuedAt > 10 * 60_000) {
    return "Signed Gmail event expiry window is too long.";
  }

  return null;
}

export function verifyGmailPushPayload({
  body,
  crmClientId,
  now = new Date(),
  sharedSecret,
  verificationSecrets,
  workspaceId,
}: {
  body: unknown;
  crmClientId: string;
  now?: Date;
  sharedSecret: string;
  verificationSecrets?: string[];
  workspaceId: string;
}):
  | { ok: true; payload: GmailPushPayload }
  | { ok: false; status: number; message: string } {
  const segments = tokenSegments(body);
  if (!segments) {
    return {
      ok: false,
      status: 400,
      message: "Signed Gmail event is missing or malformed.",
    };
  }

  const signatureValid = (verificationSecrets ?? [sharedSecret]).some(
    (secret) =>
      signaturesMatch(
        crypto
          .createHmac("sha256", secret)
          .update(segments.payloadSegment)
          .digest("base64url"),
        segments.signatureSegment,
      ),
  );
  if (!signatureValid) {
    return {
      ok: false,
      status: 401,
      message: "Signed Gmail event signature is invalid.",
    };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(
      Buffer.from(segments.payloadSegment, "base64url").toString("utf8"),
    );
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Signed Gmail event payload is invalid JSON.",
    };
  }

  const parsed = gmailPushPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Signed Gmail event payload is incomplete.",
    };
  }

  if (
    parsed.data.crmClientId !== crmClientId ||
    parsed.data.workspaceId !== workspaceId
  ) {
    return {
      ok: false,
      status: 403,
      message: "Signed Gmail event does not match this CRM workspace.",
    };
  }

  const invalidTimestamp = timestampError(parsed.data, now);
  if (invalidTimestamp) {
    return { ok: false, status: 400, message: invalidTimestamp };
  }

  return { ok: true, payload: parsed.data };
}
