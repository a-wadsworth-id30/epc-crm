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

export function buildCustomerDocumentShareEmailContent({
  documentNames,
  expiresAt,
  message,
  recipientName,
  shareUrl,
  subject = "Documents shared with you",
}: {
  documentNames: string[];
  expiresAt: Date;
  message?: string | null;
  recipientName?: string | null;
  shareUrl: string;
  subject?: string | null;
}) {
  const greeting = recipientName?.trim()
    ? `Hi ${recipientName.trim()},`
    : "Hi,";
  const expiryText = formatExpiryDate(expiresAt);
  const safeSubject = subject?.trim() || "Documents shared with you";
  const documentListText = documentNames.map((name) => `- ${name}`).join("\n");
  const messageText = message?.trim() ? `\n\n${message.trim()}` : "";
  const text = `${greeting}

We have shared the following document${documentNames.length === 1 ? "" : "s"} for you to review or download:

${documentListText}

Open your secure document link:
${shareUrl}

This secure link only gives access to the files listed here. Download access ends on ${expiryText}, or earlier if we close the link.

If anything looks wrong or you cannot open a file, reply to this email and we will help.${messageText}

Kind regards`;
  const documentListHtml = documentNames
    .map((name) => `<li>${escapeHtml(name)}</li>`)
    .join("");
  const messageHtml = message?.trim()
    ? `<p>${escapeHtml(message.trim()).replace(/\n/g, "<br />")}</p>`
    : "";
  const html = `<p>${escapeHtml(greeting)}</p>
<p>We have shared the following document${documentNames.length === 1 ? "" : "s"} for you to review or download:</p>
<ul>${documentListHtml}</ul>
<p><a href="${escapeHtml(shareUrl)}">Open your secure document link</a></p>
<p>This secure link only gives access to the files listed here. Download access ends on ${escapeHtml(expiryText)}, or earlier if we close the link.</p>
<p>If anything looks wrong or you cannot open a file, reply to this email and we will help.</p>
${messageHtml}
<p>Kind regards</p>`;

  return {
    html,
    subject: safeSubject,
    text,
  };
}
