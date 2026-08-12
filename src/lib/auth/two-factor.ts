import "server-only";

import crypto from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const challengeTtlMs = 5 * 60 * 1000;
const codePeriodSeconds = 30;
const totpDigits = 6;

type TwoFactorChallengePayload = {
  expiresAt: number;
  issuedAt: number;
  nonce: string;
  userId: string;
};

function credentialSigningKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!secret || secret.length < 16) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is missing or invalid.");
  }

  return crypto.createHash("sha256").update(`2fa:${secret}`).digest();
}

function base32Encode(input: Buffer) {
  let bits = "";
  let output = "";

  for (const byte of input) {
    bits += byte.toString(2).padStart(8, "0");
  }

  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += base32Alphabet[Number.parseInt(chunk, 2)];
  }

  return output;
}

function base32Decode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  const bytes: number[] = [];

  for (const character of normalized) {
    const index = base32Alphabet.indexOf(character);

    if (index === -1) {
      throw new Error("Invalid TOTP secret.");
    }

    bits += index.toString(2).padStart(5, "0");
  }

  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  return Buffer.from(bytes);
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function totpAt(secret: string, counter: number) {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** totpDigits).padStart(totpDigits, "0");
}

export function generateTwoFactorSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function formatTwoFactorSecret(secret: string) {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export function normalizeTwoFactorCode(value: string) {
  return value.replace(/\D/g, "");
}

export function verifyTwoFactorCode(secret: string, code: string) {
  const normalizedCode = normalizeTwoFactorCode(code);

  if (normalizedCode.length !== totpDigits) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / codePeriodSeconds);

  try {
    for (let drift = -1; drift <= 1; drift += 1) {
      if (
        timingSafeStringEqual(totpAt(secret, currentCounter + drift), normalizedCode)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

export function twoFactorOtpAuthUrl({
  email,
  issuer,
  secret,
}: {
  email: string;
  issuer: string;
  secret: string;
}) {
  const label = `${issuer}:${email}`;
  const url = new URL(`otpauth://totp/${encodeURIComponent(label)}`);
  url.searchParams.set("secret", secret);
  url.searchParams.set("issuer", issuer);
  url.searchParams.set("algorithm", "SHA1");
  url.searchParams.set("digits", String(totpDigits));
  url.searchParams.set("period", String(codePeriodSeconds));

  return url.toString();
}

export function createTwoFactorChallengeToken(userId: string) {
  const payload: TwoFactorChallengePayload = {
    expiresAt: Date.now() + challengeTtlMs,
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(16).toString("base64url"),
    userId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", credentialSigningKey())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifyTwoFactorChallengeToken(token: string) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", credentialSigningKey())
    .update(encodedPayload)
    .digest("base64url");

  if (!timingSafeStringEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<TwoFactorChallengePayload>;

    if (
      typeof payload.userId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return { userId: payload.userId };
  } catch {
    return null;
  }
}
