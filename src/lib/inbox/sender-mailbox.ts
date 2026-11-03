export function isReplySenderOverride(
  selectedMailboxId: string | null | undefined,
  sourceMailboxId: string | null | undefined,
) {
  return Boolean(
    selectedMailboxId && selectedMailboxId !== (sourceMailboxId ?? null),
  );
}

export function canPreserveGmailThread({
  messageMailboxId,
  provider,
  providerThreadId,
  selectedMailboxId,
}: {
  messageMailboxId: string | null | undefined;
  provider: string;
  providerThreadId: string | null | undefined;
  selectedMailboxId: string | null | undefined;
}) {
  return Boolean(
    provider === "gmail" &&
      messageMailboxId &&
      providerThreadId &&
      selectedMailboxId === messageMailboxId,
  );
}
