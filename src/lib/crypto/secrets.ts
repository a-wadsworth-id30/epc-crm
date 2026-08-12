import "server-only";

import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function getEncryptionKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!secret) {
    return null;
  }

  const base64Key = Buffer.from(secret, "base64");
  if (base64Key.length === 32) {
    return base64Key;
  }

  const hexKey = Buffer.from(secret, "hex");
  if (hexKey.length === 32) {
    return hexKey;
  }

  if (secret.length >= 32) {
    return crypto.createHash("sha256").update(secret).digest();
  }

  return null;
}

export function hasCredentialEncryptionKey() {
  return getEncryptionKey() !== null;
}

export function encryptSecret(value: string) {
  const key = getEncryptionKey();

  if (!key) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is missing or invalid.");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string) {
  const key = getEncryptionKey();

  if (!key) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is missing or invalid.");
  }

  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Encrypted secret has an unsupported format.");
  }

  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
