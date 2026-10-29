export const saleConversationFilters = [
  { value: "ALL", label: "All" },
  { value: "PHONE", label: "Calls" },
  { value: "EMAIL", label: "Emails" },
  { value: "NOTE", label: "Notes" },
  { value: "SMS", label: "SMS" },
  { value: "FILE", label: "Files" },
  { value: "WEBSITE", label: "Website" },
] as const;

export const saleConversationPageSize = 12;

export type SaleConversationFilter =
  (typeof saleConversationFilters)[number]["value"];

export type SaleConversationItem = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  summary: string;
  body: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  occurredAt: string;
  userName: string | null;
  contactName: string | null;
  metadata: unknown;
  gmailReply?: {
    emailMessageId: string;
    recipient: string;
    subject: string;
  } | null;
};

export type SaleConversationCounts = Record<SaleConversationFilter, number>;

export type SaleConversationPage = {
  counts: SaleConversationCounts;
  filter: SaleConversationFilter;
  items: SaleConversationItem[];
  page: number;
  pageSize: number;
  query: string;
  total: number;
  totalPages: number;
};

export function isSaleConversationFilter(
  value: string | null,
): value is SaleConversationFilter {
  return saleConversationFilters.some((filter) => filter.value === value);
}

function searchableMetadata(value: unknown) {
  try {
    return JSON.stringify(value ?? "");
  } catch {
    return "";
  }
}

export function conversationItemMatchesQuery(
  item: SaleConversationItem,
  query: string,
) {
  const terms = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return true;

  const searchableText = [
    item.subject,
    item.summary,
    item.body,
    item.fromAddress,
    item.toAddress,
    item.contactName,
    item.userName,
    item.channel,
    item.direction,
    searchableMetadata(item.metadata),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  return terms.every((term) => searchableText.includes(term));
}
