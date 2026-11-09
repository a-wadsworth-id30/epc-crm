import crypto from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  event: z.literal("id30-auth.canary"),
  version: z.literal(1),
  crmClientId: z.string().min(1),
  workspaceId: z.string().min(1),
  nonce: z.string().uuid(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

function signaturesMatch(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function verifyId30AuthCanary({
  body,
  crmClientId,
  now = new Date(),
  verificationSecrets,
  workspaceId,
}: {
  body: unknown;
  crmClientId: string;
  now?: Date;
  verificationSecrets: string[];
  workspaceId: string;
}) {
  const token =
    body && typeof body === "object" && "token" in body
      ? (body as { token?: unknown }).token
      : null;
  if (typeof token !== "string") {
    return { ok: false as const, status: 400, message: "Canary token is missing." };
  }
  const [payloadSegment, signatureSegment, extra] = token.split(".");
  if (!payloadSegment || !signatureSegment || extra) {
    return { ok: false as const, status: 400, message: "Canary token is malformed." };
  }
  const signatureValid = verificationSecrets.some((secret) =>
    signaturesMatch(
      crypto.createHmac("sha256", secret).update(payloadSegment).digest("base64url"),
      signatureSegment,
    ),
  );
  if (!signatureValid) {
    return { ok: false as const, status: 401, message: "Canary signature is invalid." };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
  } catch {
    return { ok: false as const, status: 400, message: "Canary payload is invalid." };
  }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return { ok: false as const, status: 400, message: "Canary payload is incomplete." };
  }
  if (
    parsed.data.crmClientId !== crmClientId ||
    parsed.data.workspaceId !== workspaceId
  ) {
    return { ok: false as const, status: 403, message: "Canary tenant does not match." };
  }
  const issuedAt = Date.parse(parsed.data.issuedAt);
  const expiresAt = Date.parse(parsed.data.expiresAt);
  if (
    issuedAt > now.getTime() + 60_000 ||
    expiresAt <= now.getTime() ||
    expiresAt - issuedAt > 5 * 60_000
  ) {
    return { ok: false as const, status: 400, message: "Canary timestamps are invalid." };
  }
  return { ok: true as const, payload: parsed.data };
}
