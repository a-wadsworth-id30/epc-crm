export type InboxContactSummary = {
  firstName: string;
  lastName: string;
  email: string | null;
};

export type InboxOpportunitySummary = {
  id: string;
  stage: string;
  title: string;
};

export type InboxMessageSummary = {
  id: string;
  contact: InboxContactSummary | null;
  direction: string;
  fromAddress: string | null;
  fromName: string | null;
  inboundRouteId: string | null;
  opportunity: InboxOpportunitySummary | null;
  receivedAt: string;
  status: string;
  subject: string | null;
  summary: string;
  toAddress: string | null;
};

export type InboxMessageDetail = InboxMessageSummary & {
  htmlBody: string | null;
  textBody: string | null;
};
