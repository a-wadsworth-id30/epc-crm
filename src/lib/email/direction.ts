type InferredEmailDirectionInput = {
  contactAddresses?: string[];
  contactName?: string | null;
  fromAddress?: string | null;
  fromName?: string | null;
  storedDirection: string;
};

function normalizedIdentity(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function inferredEmailDirection({
  contactAddresses = [],
  contactName,
  fromAddress,
  fromName,
  storedDirection,
}: InferredEmailDirectionInput) {
  const normalizedFromAddress = normalizedIdentity(fromAddress);
  const senderMatchesContactAddress =
    normalizedFromAddress.length > 0 &&
    contactAddresses.some(
      (address) => normalizedIdentity(address) === normalizedFromAddress,
    );

  if (senderMatchesContactAddress) return "INBOUND";

  const normalizedContactName = normalizedIdentity(contactName);
  const senderMatchesContactName =
    !normalizedFromAddress &&
    normalizedContactName.length > 0 &&
    normalizedIdentity(fromName) === normalizedContactName;

  return senderMatchesContactName ? "INBOUND" : storedDirection;
}
