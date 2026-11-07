export type EmailReplyDraft = {
  body: string;
  htmlBody: string;
  mailboxId: string;
  recipient: string;
  savedAt: string;
  subject: string;
};

const DRAFT_PREFIX = "id30:email-reply-draft:v1";
const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function emailReplyDraftKey(ownerId: string, messageId: string) {
  return `${DRAFT_PREFIX}:${encodeURIComponent(ownerId)}:${encodeURIComponent(messageId)}`;
}

function isDraft(value: unknown): value is EmailReplyDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.body === "string" &&
    typeof draft.htmlBody === "string" &&
    typeof draft.mailboxId === "string" &&
    typeof draft.recipient === "string" &&
    typeof draft.savedAt === "string" &&
    typeof draft.subject === "string"
  );
}

export function readEmailReplyDraft(
  storage: Pick<Storage, "getItem" | "removeItem">,
  ownerId: string,
  messageId: string,
  now = Date.now(),
) {
  const key = emailReplyDraftKey(ownerId, messageId);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed)) {
      storage.removeItem(key);
      return null;
    }

    const savedAt = Date.parse(parsed.savedAt);
    if (!Number.isFinite(savedAt) || now - savedAt > DRAFT_MAX_AGE_MS) {
      storage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeEmailReplyDraft(
  storage: Pick<Storage, "setItem" | "removeItem">,
  ownerId: string,
  messageId: string,
  draft: Omit<EmailReplyDraft, "savedAt">,
  now = new Date(),
) {
  const key = emailReplyDraftKey(ownerId, messageId);
  if (!draft.body.trim()) {
    storage.removeItem(key);
    return null;
  }

  const savedDraft = { ...draft, savedAt: now.toISOString() };
  storage.setItem(key, JSON.stringify(savedDraft));
  return savedDraft;
}

export function removeEmailReplyDraft(
  storage: Pick<Storage, "removeItem">,
  ownerId: string,
  messageId: string,
) {
  storage.removeItem(emailReplyDraftKey(ownerId, messageId));
}
