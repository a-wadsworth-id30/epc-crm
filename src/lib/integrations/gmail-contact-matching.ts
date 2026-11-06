import { emailAddresses } from "@/lib/email/addresses";

type GmailParticipantInput = {
  direction: "INBOUND" | "OUTBOUND";
  from: string | null;
  mailboxAddress: string;
  replyTo: string | null;
  to: string | null;
};

export function gmailParticipantAddressesForMatch({
  direction,
  from,
  mailboxAddress,
  replyTo,
  to,
}: GmailParticipantInput) {
  const mailbox = mailboxAddress.trim().toLowerCase();
  const addresses =
    direction === "INBOUND"
      ? emailAddresses(from).length
        ? emailAddresses(from)
        : emailAddresses(replyTo)
      : emailAddresses(to);

  return addresses.filter((address) => address !== mailbox);
}

export function unambiguousContactId(
  matches: Array<{ id: string }>,
) {
  const ids = [...new Set(matches.map(({ id }) => id))];
  return ids.length === 1 ? ids[0] : null;
}
