import "server-only";

import {
  sendMailerSendEmail,
  type SendMailerSendEmailInput,
} from "@/lib/integrations/mailersend";
import { trustedAppBaseUrl } from "@/lib/http/origin";
import {
  buildSaleNoteMentionEmailContent,
  saleNoteMentionRecipientName,
} from "@/lib/sales/note-mention-email-content";
import type { SaleNoteMentionUser } from "@/lib/sales/note-mentions";

export type SendSaleNoteMentionEmailInput = {
  mentionedByName: string;
  noteBody: string;
  recipient: SaleNoteMentionUser;
  saleId: string;
  saleTitle: string;
};

export type SaleNoteMentionEmailSendResult = Awaited<
  ReturnType<typeof sendMailerSendEmail>
>;

export async function sendSaleNoteMentionEmail({
  mentionedByName,
  noteBody,
  recipient,
  saleId,
  saleTitle,
}: SendSaleNoteMentionEmailInput): Promise<SaleNoteMentionEmailSendResult> {
  const saleUrl = new URL(`/sales/${saleId}`, trustedAppBaseUrl()).toString();
  const content = buildSaleNoteMentionEmailContent({
    mentionedByName,
    noteBody,
    recipientName: saleNoteMentionRecipientName(recipient),
    saleTitle,
    saleUrl,
  });
  const message: SendMailerSendEmailInput = {
    html: content.html,
    subject: content.subject,
    tags: ["crm", "sale-note-mention"],
    text: content.text,
    to: {
      email: recipient.email,
      name: saleNoteMentionRecipientName(recipient),
    },
  };

  return sendMailerSendEmail(message);
}
