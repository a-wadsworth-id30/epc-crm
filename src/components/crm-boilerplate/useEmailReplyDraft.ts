"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readEmailReplyDraft,
  removeEmailReplyDraft,
  writeEmailReplyDraft,
  type EmailReplyDraft,
} from "@/lib/email/reply-drafts";

type DraftFields = Omit<EmailReplyDraft, "savedAt">;

export default function useEmailReplyDraft({
  fields,
  messageId,
  onRestore,
  open,
  ownerId,
}: {
  fields: DraftFields;
  messageId: string | null | undefined;
  onRestore: (draft: EmailReplyDraft) => void;
  open: boolean;
  ownerId: string;
}) {
  const [status, setStatus] = useState<"idle" | "restored" | "saving" | "saved">("idle");
  const fieldsRef = useRef(fields);
  const onRestoreRef = useRef(onRestore);
  const restoredKeyRef = useRef<string | null>(null);

  const activeKey = open && messageId ? `${ownerId}:${messageId}` : null;

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  const saveNow = useCallback(() => {
    if (!messageId) return;
    try {
      const saved = writeEmailReplyDraft(
        window.localStorage,
        ownerId,
        messageId,
        fieldsRef.current,
      );
      setStatus(saved ? "saved" : "idle");
    } catch {
      setStatus("idle");
    }
  }, [messageId, ownerId]);

  function discard() {
    if (messageId) {
      try {
        removeEmailReplyDraft(window.localStorage, ownerId, messageId);
      } catch {
        // Storage can be unavailable in private or restricted browser contexts.
      }
    }
    setStatus("idle");
  }

  useEffect(() => {
    if (!activeKey) {
      restoredKeyRef.current = null;
      return;
    }
    if (!messageId || restoredKeyRef.current === activeKey) return;
    restoredKeyRef.current = activeKey;
    const timer = window.setTimeout(() => {
      try {
        const draft = readEmailReplyDraft(window.localStorage, ownerId, messageId);
        if (draft) {
          onRestoreRef.current(draft);
          setStatus("restored");
        } else {
          setStatus("idle");
        }
      } catch {
        setStatus("idle");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeKey, messageId, ownerId]);

  useEffect(() => {
    if (!activeKey || restoredKeyRef.current !== activeKey) return;
    const statusTimer = window.setTimeout(
      () => setStatus(fields.body.trim() ? "saving" : "idle"),
      0,
    );
    const saveTimer = window.setTimeout(saveNow, 500);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(saveTimer);
    };
  }, [
    activeKey,
    fields.body,
    fields.htmlBody,
    fields.mailboxId,
    fields.recipient,
    fields.subject,
    saveNow,
  ]);

  useEffect(() => {
    if (!open) return;
    const handleBeforeUnload = () => saveNow();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [open, saveNow]);

  return { discard, saveNow, status };
}
