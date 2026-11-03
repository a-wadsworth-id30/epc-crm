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
  mailboxId: string | null;
  mailboxAddress: string | null;
  opportunity: InboxOpportunitySummary | null;
  provider: string;
  receivedAt: string;
  replyToAddress: string | null;
  status: string;
  subject: string | null;
  summary: string;
  toAddress: string | null;
};

export type EmailMailboxOption = {
  displayName: string | null;
  emailAddress: string;
  id: string;
  purpose: string;
};

export type InboxMessageDetail = InboxMessageSummary & {
  fullHtmlBody: string | null;
  fullTextBody: string;
  latestHtmlBody: string | null;
  latestTextBody: string;
};
