import { normalizeRoleTemplate } from "@/lib/users/role-templates";

export const gmailMailboxPurposeValues = [
  "PERSONAL",
  "SALES",
  "NEW_BUSINESS",
  "CUSTOMER_SUCCESS",
  "SUPPORT",
  "ACCOUNTS",
  "SHARED",
] as const;

export type GmailMailboxPurpose =
  (typeof gmailMailboxPurposeValues)[number];

export const gmailMailboxTeamPurposeOptions = [
  { value: "SALES", label: "Sales" },
  { value: "NEW_BUSINESS", label: "New Business" },
  { value: "CUSTOMER_SUCCESS", label: "Customer Success" },
  { value: "SUPPORT", label: "Support" },
] as const;

export function isLegacyGmailMailboxPurpose(
  purpose: GmailMailboxPurpose,
) {
  return purpose === "ACCOUNTS" || purpose === "SHARED";
}

export function canOwnPersonalGmailMailbox(user: {
  roleTemplate?: string | null;
}) {
  return normalizeRoleTemplate(user.roleTemplate) === "owner";
}

export function defaultGmailMailboxPurpose(user?: {
  roleTemplate?: string | null;
} | null): GmailMailboxPurpose {
  return user && canOwnPersonalGmailMailbox(user) ? "PERSONAL" : "SALES";
}
