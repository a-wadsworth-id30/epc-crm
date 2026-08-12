export type MessagePersonalisationContext = {
  companyName?: string | null;
  customerFirstName?: string | null;
  customerName?: string | null;
  leadTitle?: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
};

function cleanValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function firstName(value: string | null | undefined) {
  const cleaned = cleanValue(value);
  return cleaned?.split(/\s+/)[0] ?? null;
}

function tidyMessage(value: string) {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export function personaliseOutboundMessage(
  value: string,
  context: MessagePersonalisationContext,
) {
  const customerName = cleanValue(context.customerName);
  const customerFirstName =
    cleanValue(context.customerFirstName) ?? firstName(customerName);
  const companyName = cleanValue(context.companyName);
  const leadTitle = cleanValue(context.leadTitle);
  const ownerName = cleanValue(context.ownerName);
  const ownerEmail = cleanValue(context.ownerEmail);
  const ownerPhone = cleanValue(context.ownerPhone);

  const liquidTags: Record<string, string | null> = {
    "company.name": companyName,
    "contact.first_name": customerFirstName,
    "contact.name": customerName,
    "customer.first_name": customerFirstName,
    "customer.name": customerName,
    "lead.title": leadTitle,
    "owner.email": ownerEmail,
    "owner.name": ownerName,
    "owner.phone": ownerPhone,
    "sale.title": leadTitle,
    "user.email": ownerEmail,
    "user.name": ownerName,
    "user.phone": ownerPhone,
  };

  const bracketTags: Record<string, string | null> = {
    "company name": companyName,
    "contact first name": customerFirstName,
    "contact name": customerName,
    "customer first name": customerFirstName,
    "customer name": customerName,
    email: ownerEmail,
    "first name": customerFirstName,
    "lead title": leadTitle,
    "owner email": ownerEmail,
    "owner name": ownerName,
    "owner phone": ownerPhone,
    phone: ownerPhone,
    "sale title": leadTitle,
    "sender email": ownerEmail,
    "sender name": ownerName,
    "sender phone": ownerPhone,
    "your email": ownerEmail,
    "your name": ownerName,
    "your phone": ownerPhone,
  };

  const resolvedLiquid = value.replace(
    /{{\s*([a-z0-9_.-]+)\s*}}/gi,
    (_match, key: string) => liquidTags[key.toLowerCase()] ?? "",
  );
  const resolvedBrackets = resolvedLiquid.replace(
    /\[([^\]\n]{1,80})\]/g,
    (_match, key: string) => bracketTags[normaliseKey(key)] ?? "",
  );

  return tidyMessage(resolvedBrackets);
}

export function hasUnresolvedMessagePlaceholders(value: string) {
  return /{{\s*[a-z0-9_.-]+\s*}}/i.test(value) || /\[[^\]\n]{1,80}\]/.test(value);
}
