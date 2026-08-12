import "server-only";

import { buildCustomerDocumentPortalEmailContent } from "@/lib/customer-document-portal-email-content";
import {
  getMailerSendInboundReplyAddress,
  sendMailerSendEmail,
} from "@/lib/integrations/mailersend";

export async function sendCustomerDocumentPortalEmail({
  documentNames,
  expiresAt,
  message,
  portalUrl,
  recipientEmail,
  recipientName,
  requestedDocumentLabels,
  signatureRequestCount,
  subject,
}: {
  documentNames: string[];
  expiresAt: Date;
  message?: string | null;
  portalUrl: string;
  recipientEmail: string;
  recipientName?: string | null;
  requestedDocumentLabels: string[];
  signatureRequestCount: number;
  subject?: string | null;
}) {
  const content = buildCustomerDocumentPortalEmailContent({
    documentNames,
    expiresAt,
    message,
    portalUrl,
    recipientName,
    requestedDocumentLabels,
    signatureRequestCount,
    subject,
  });
  const replyToEmail = await getMailerSendInboundReplyAddress();

  return sendMailerSendEmail({
    html: content.html,
    replyToEmail,
    subject: content.subject,
    tags: ["crm", "document-portal"],
    text: content.text,
    to: {
      email: recipientEmail,
      name: recipientName,
    },
  });
}
