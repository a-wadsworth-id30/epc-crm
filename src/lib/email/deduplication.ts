import { firstEmailAddress } from "@/lib/email/addresses";

type EmailIdentitySource = {
  headers?: unknown;
  internetMessageId?: string | null;
  metadata?: unknown;
};

type EmailDuplicateCandidate = EmailIdentitySource & {
  body?: string | null;
  direction: string;
  fromAddress?: string | null;
  occurredAt: Date | string;
  subject?: string | null;
  toAddress?: string | null;
};

type ConversationEmailItem = {
  body?: string | null;
  channel: string;
  direction: string;
  emailIdentity?: string | null;
  emailProvider?: string | null;
  fromAddress?: string | null;
  fullEmailBody?: string | null;
  fullEmailHtmlBody?: string | null;
  id: string;
  occurredAt: string;
  subject?: string | null;
  toAddress?: string | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function headerValue(value: unknown, names: string[]) {
  const source = objectValue(value);
  const normalizedNames = new Set(
    names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );

  for (const [key, candidate] of Object.entries(source)) {
    if (
      !normalizedNames.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""))
    ) {
      continue;
    }
    if (typeof candidate === "string") return candidate;
    if (Array.isArray(candidate)) {
      const text = candidate.find((item) => typeof item === "string");
      if (typeof text === "string") return text;
    }
  }

  return null;
}

export function normalizeInternetMessageId(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

export function emailInternetMessageIdentity(source: EmailIdentitySource) {
  const metadata = objectValue(source.metadata);
  return normalizeInternetMessageId(
    source.internetMessageId ??
      headerValue(source.headers, ["message-id", "messageId"]) ??
      headerValue(metadata, ["internetMessageId", "message-id"]),
  );
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() || "";
}

function occurredAtMillis(value: Date | string) {
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function strictContentKey(candidate: EmailDuplicateCandidate) {
  return [
    candidate.direction,
    firstEmailAddress(candidate.fromAddress) ?? "",
    firstEmailAddress(candidate.toAddress) ?? "",
    normalizeText(candidate.subject),
    normalizeText(candidate.body),
  ].join("|");
}

export function emailMessagesAreDuplicates(
  left: EmailDuplicateCandidate,
  right: EmailDuplicateCandidate,
) {
  const leftIdentity = emailInternetMessageIdentity(left);
  const rightIdentity = emailInternetMessageIdentity(right);
  if (leftIdentity && rightIdentity) return leftIdentity === rightIdentity;

  if (!normalizeText(left.body) || !normalizeText(right.body)) return false;
  if (strictContentKey(left) !== strictContentKey(right)) return false;

  return (
    Math.abs(occurredAtMillis(left.occurredAt) - occurredAtMillis(right.occurredAt)) <=
    2 * 60 * 1000
  );
}

function conversationItemScore(item: ConversationEmailItem) {
  return (
    (item.emailProvider === "gmail" ? 8 : 0) +
    (item.emailIdentity ? 4 : 0) +
    (item.fullEmailHtmlBody ? 2 : 0) +
    (item.fullEmailBody ? 1 : 0)
  );
}

export function deduplicateConversationEmailItems<
  T extends ConversationEmailItem,
>(items: T[]) {
  const result: T[] = [];

  for (const item of items) {
    if (item.channel !== "EMAIL") {
      result.push(item);
      continue;
    }

    const duplicateIndex = result.findIndex(
      (candidate) =>
        candidate.channel === "EMAIL" &&
        emailMessagesAreDuplicates(
          {
            body: candidate.body,
            direction: candidate.direction,
            fromAddress: candidate.fromAddress,
            internetMessageId: candidate.emailIdentity,
            occurredAt: candidate.occurredAt,
            subject: candidate.subject,
            toAddress: candidate.toAddress,
          },
          {
            body: item.body,
            direction: item.direction,
            fromAddress: item.fromAddress,
            internetMessageId: item.emailIdentity,
            occurredAt: item.occurredAt,
            subject: item.subject,
            toAddress: item.toAddress,
          },
        ),
    );

    if (duplicateIndex === -1) {
      result.push(item);
      continue;
    }

    if (
      conversationItemScore(item) >
      conversationItemScore(result[duplicateIndex])
    ) {
      result[duplicateIndex] = item;
    }
  }

  return result;
}
