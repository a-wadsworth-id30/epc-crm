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
};

export type SaleConversationCounts = Record<SaleConversationFilter, number>;

export type SaleConversationPage = {
  counts: SaleConversationCounts;
  filter: SaleConversationFilter;
  items: SaleConversationItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function isSaleConversationFilter(
  value: string | null,
): value is SaleConversationFilter {
  return saleConversationFilters.some((filter) => filter.value === value);
}
