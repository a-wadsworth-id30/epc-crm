import "server-only";

import { buildCustomerDocumentShareEmailContent } from "@/lib/customer-document-share-email-content";
import {
  getMailerSendInboundReplyAddress,
  sendMailerSendEmail,
} from "@/lib/integrations/mailersend";

export async function sendCustomerDocumentShareEmail({
  documentNames,
  expiresAt,
  message,
  recipientEmail,
  recipientName,
  shareUrl,
  subject,
}: {
  documentNames: string[];
  expiresAt: Date;
  message?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  shareUrl: string;
  subject?: string | null;
}) {
  const content = buildCustomerDocumentShareEmailContent({
    documentNames,
    expiresAt,
    message,
    recipientName,
    shareUrl,
    subject,
  });
  const replyToEmail = await getMailerSendInboundReplyAddress();

  return sendMailerSendEmail({
    html: content.html,
    replyToEmail,
    subject: content.subject,
    tags: ["crm", "document-share"],
    text: content.text,
    to: {
      email: recipientEmail,
      name: recipientName,
    },
  });
}
