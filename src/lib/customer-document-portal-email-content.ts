export type CustomerDocumentPortalEmailContentInput = {
  documentNames: string[];
  expiresAt: Date;
  message?: string | null;
  portalUrl: string;
  recipientName?: string | null;
  requestedDocumentLabels: string[];
  signatureRequestCount: number;
  subject?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExpiryDate(expiresAt: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(expiresAt);
}

function listText(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "";
}

function listHtml(items: string[]) {
  return items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
}

export function buildCustomerDocumentPortalEmailContent({
  documentNames,
  expiresAt,
  message,
  portalUrl,
  recipientName,
  requestedDocumentLabels,
  signatureRequestCount,
  subject = "Your secure document portal",
}: CustomerDocumentPortalEmailContentInput) {
  const greeting = recipientName?.trim()
    ? `Hi ${recipientName.trim()},`
    : "Hi,";
  const safeSubject = subject?.trim() || "Your secure document portal";
  const expiryText = formatExpiryDate(expiresAt);
  const uploadText = requestedDocumentLabels.length
    ? `\nDocuments requested from you:\n${listText(requestedDocumentLabels)}\n`
    : "";
  const sharedText = documentNames.length
    ? `\nDocuments shared with you:\n${listText(documentNames)}\n`
    : "";
  const signatureText = signatureRequestCount
    ? `\nSignature requests: ${signatureRequestCount}\n`
    : "";
  const messageText = message?.trim() ? `\n\n${message.trim()}` : "";
  const text = `${greeting}

Your secure document portal is ready.

Use this one link to review shared documents, upload anything we have requested and check signature progress. After you upload or sign, our team will be notified and will review the next step.${uploadText}${sharedText}${signatureText}
Open your secure portal:
${portalUrl}

This portal expires on ${expiryText}. If you need more time, reply to this email and we can issue a new link.${messageText}

Kind regards`;
  const uploadHtml = requestedDocumentLabels.length
    ? `<p>Documents requested from you:</p>${listHtml(requestedDocumentLabels)}`
    : "";
  const sharedHtml = documentNames.length
    ? `<p>Documents shared with you:</p>${listHtml(documentNames)}`
    : "";
  const signatureHtml = signatureRequestCount
    ? `<p>Signature requests: ${signatureRequestCount}</p>`
    : "";
  const messageHtml = message?.trim()
    ? `<p>${escapeHtml(message.trim()).replace(/\n/g, "<br />")}</p>`
    : "";
  const html = `<p>${escapeHtml(greeting)}</p>
<p>Your secure document portal is ready.</p>
<p>Use this one link to review shared documents, upload anything we have requested and check signature progress. After you upload or sign, our team will be notified and will review the next step.</p>
${uploadHtml}
${sharedHtml}
${signatureHtml}
<p><a href="${escapeHtml(portalUrl)}">Open your secure portal</a></p>
<p>This portal expires on ${escapeHtml(expiryText)}. If you need more time, reply to this email and we can issue a new link.</p>
${messageHtml}
<p>Kind regards</p>`;

  return {
    html,
    subject: safeSubject,
    text,
  };
}
