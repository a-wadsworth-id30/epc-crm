export type GmailMailboxAuditSnapshot = {
  accessUserIds: string[];
  ownerUserId: string | null;
  purpose: string;
  sendEnabled: boolean;
  syncEnabled: boolean;
};

type GmailMailboxAuditValue = boolean | string | string[] | null;

export type GmailMailboxConfigurationChanges = Partial<
  Record<
    keyof GmailMailboxAuditSnapshot,
    { from: GmailMailboxAuditValue; to: GmailMailboxAuditValue }
  >
>;

function normalizedUserIds(userIds: string[]) {
  return [...new Set(userIds)].sort((left, right) => left.localeCompare(right));
}

function normalizedSnapshot(
  snapshot: GmailMailboxAuditSnapshot,
): GmailMailboxAuditSnapshot {
  return {
    ...snapshot,
    accessUserIds: normalizedUserIds(snapshot.accessUserIds),
  };
}

export function gmailMailboxConfigurationChanges(
  previous: GmailMailboxAuditSnapshot,
  next: GmailMailboxAuditSnapshot,
) {
  const before = normalizedSnapshot(previous);
  const after = normalizedSnapshot(next);
  const changes: GmailMailboxConfigurationChanges = {};

  for (const field of Object.keys(before) as Array<keyof GmailMailboxAuditSnapshot>) {
    const from = before[field];
    const to = after[field];
    const equal = Array.isArray(from)
      ? Array.isArray(to) &&
        from.length === to.length &&
        from.every((value, index) => value === to[index])
      : from === to;

    if (!equal) {
      changes[field] = { from, to } as never;
    }
  }

  return changes;
}
