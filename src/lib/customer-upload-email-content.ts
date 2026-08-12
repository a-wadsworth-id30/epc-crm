export type CustomerUploadRequestEmailContentInput = {
  brandName?: string;
  documentLabels: string[];
  expiresAt: Date;
  logoUrl?: string;
  message?: string | null;
  recipientName?: string | null;
  uploadUrl: string;
};

export function buildCustomerUploadRequestEmailContent({
  brandName = "iD30",
  documentLabels,
  expiresAt,
  logoUrl,
  message,
  recipientName,
  uploadUrl,
}: CustomerUploadRequestEmailContentInput) {
  const greeting = recipientName?.trim()
    ? `Hi ${recipientName.trim()},`
    : "Hi,";
  const formattedExpiry = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(expiresAt);
  const requestedDocuments = documentLabels.length
    ? documentLabels.map((label) => `- ${label}`).join("\n")
    : "- Requested documents";
  const senderMessage = message?.trim();
  const text = [
    greeting,
    "",
    "We need these documents so we can check the details for your enquiry and keep your project moving.",
    "",
    `This is a private, time-limited upload link for documents requested by ${brandName}. Please do not forward it unless our team asks you to share it with someone helping prepare the documents.`,
    "",
    "Files uploaded through the page are sent over an encrypted connection into private CRM document storage.",
    "",
    "Please upload clear photos, scans or PDF copies using this secure link:",
    uploadUrl,
    "",
    "Requested documents:",
    requestedDocuments,
    "",
    "Once uploaded, the files go directly to our team and we will review them before getting back to you.",
    "",
    `This link expires on ${formattedExpiry}. If it has expired, reply to this email and we will send a new one if anything is still needed.`,
    senderMessage ? "" : null,
    senderMessage || null,
    "",
    "Thanks,",
    brandName,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const escapedUploadUrl = escapeHtml(uploadUrl);
  const escapedBrandName = escapeHtml(brandName);
  const brandHeaderHtml = logoUrl
    ? `<div style="text-align:center;margin:0 0 24px;"><img src="${escapeHtml(logoUrl)}" alt="${escapedBrandName} logo" style="display:inline-block;max-width:220px;max-height:72px;width:auto;height:auto;object-fit:contain;" /><div style="margin-top:10px;font-size:13px;line-height:20px;color:#667085;">Secure upload request from ${escapedBrandName}</div></div>`
    : `<div style="text-align:center;margin:0 0 24px;font-size:15px;line-height:22px;font-weight:600;color:#101828;">${escapedBrandName}</div>`;
  const htmlBody = textToHtml(text).replace(
    escapedUploadUrl,
    `<a href="${escapedUploadUrl}">${escapedUploadUrl}</a>`,
  );

  return {
    html: `${brandHeaderHtml}${htmlBody}`,
    subject: "Secure document upload request",
    text,
  };
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
