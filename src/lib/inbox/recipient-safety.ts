function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function isUntrustedReplyRecipient(
  recipient: string,
  trustedAddresses: Array<string | null | undefined>,
) {
  const normalizedRecipient = normalizedEmail(recipient);
  if (!normalizedRecipient) return false;

  return !trustedAddresses.some(
    (address) => normalizedEmail(address) === normalizedRecipient,
  );
}

export function isReplyRecipientOverride(
  recipient: string,
  resolvedRecipient: string | null,
) {
  return normalizedEmail(recipient) !== normalizedEmail(resolvedRecipient);
}
