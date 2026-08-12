import "server-only";

import {
  absoluteCustomerUploadLogoUrl,
  getCustomerUploadBranding,
} from "@/lib/customer-upload-branding";
import { buildCustomerUploadRequestEmailContent } from "@/lib/customer-upload-email-content";
import {
  getMailerSendInboundReplyAddress,
  sendMailerSendEmail,
} from "@/lib/integrations/mailersend";

export type SendCustomerUploadRequestEmailInput = {
  documentLabels: string[];
  expiresAt: Date;
  message?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  uploadUrl: string;
};

export async function sendCustomerUploadRequestEmail({
  documentLabels,
  expiresAt,
  message,
  recipientEmail,
  recipientName,
  uploadUrl,
}: SendCustomerUploadRequestEmailInput) {
  const branding = await getCustomerUploadBranding();
  const content = buildCustomerUploadRequestEmailContent({
    brandName: branding.name,
    documentLabels,
    expiresAt,
    logoUrl: absoluteCustomerUploadLogoUrl({
      logoUrl: branding.logoUrl,
      uploadUrl,
    }),
    message,
    recipientName,
    uploadUrl,
  });
  const replyToEmail = await getMailerSendInboundReplyAddress();

  return sendMailerSendEmail({
    html: content.html,
    replyToEmail,
    subject: content.subject,
    tags: ["crm", "customer-upload"],
    text: content.text,
    to: {
      email: recipientEmail,
      name: recipientName,
    },
  });
}
