import type { AdvisorCapability } from "./types";

const sensitiveKeyPattern =
  /(api[_-]?key|authorization|bearer|client[_-]?secret|connection[_-]?uri|credential|database[_-]?url|dsn|password|private[_-]?key|secret|token|url)/i;

export function availableCapability<T>({
  data,
  name,
  source,
}: {
  data: T;
  name: string;
  source: string;
}): AdvisorCapability<T> {
  return { data, name, source, status: "available" };
}

export function skippedCapability<T>({
  reason,
  name,
  source,
}: {
  reason: string;
  name: string;
  source: string;
}): AdvisorCapability<T> {
  return { data: null, error: reason, name, source, status: "skipped" };
}

export function unavailableCapability<T>({
  error,
  name,
  source,
}: {
  error: unknown;
  name: string;
  source: string;
}): AdvisorCapability<T> {
  return {
    data: null,
    error: errorMessage(error),
    name,
    source,
    status: "unavailable",
  };
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export function scrubSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => scrubSensitiveValue(item));

  if (value && typeof value === "object") {
    const clean: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      clean[key] = sensitiveKeyPattern.test(key)
        ? "[redacted]"
        : scrubSensitiveValue(item);
    }

    return clean;
  }

  if (typeof value === "string" && looksLikeSensitiveUrl(value)) {
    return redactUrl(value);
  }

  return value;
}

export function toJsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(scrubSensitiveValue(value), (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}

function looksLikeSensitiveUrl(value: string) {
  return /^postgres(?:ql)?:\/\//i.test(value) || value.includes("@");
}

function redactUrl(value: string) {
  try {
    const parsed = new URL(value);

    if (parsed.username) parsed.username = "[redacted]";
    if (parsed.password) parsed.password = "[redacted]";

    return parsed.toString();
  } catch {
    return "[redacted]";
  }
}
