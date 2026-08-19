export type SaleNoteMentionEmailContentInput = {
  mentionedByName: string;
  noteBody: string;
  recipientName?: string | null;
  saleTitle: string;
  saleUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");

  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 3).trimEnd()}...`
    : trimmed;
}

export function saleNoteMentionRecipientName({
  firstName,
  lastName,
  name,
}: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}) {
  const explicitName = [firstName, lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  return explicitName || name?.trim() || null;
}

export function buildSaleNoteMentionEmailContent({
  mentionedByName,
  noteBody,
  recipientName,
  saleTitle,
  saleUrl,
}: SaleNoteMentionEmailContentInput) {
  const greeting = recipientName?.trim()
    ? `Hi ${recipientName.trim()},`
    : "Hi,";
  const noteExcerpt = truncateText(noteBody, 1200);
  const subject = truncateText(`You were mentioned on ${saleTitle}`, 180);
  const text = `${greeting}

${mentionedByName} mentioned you in a sales note on ${saleTitle}.

Note:
${noteExcerpt}

Open the lead:
${saleUrl}

Review the note in the CRM and complete the mention review task when done.`;

  const html = `<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(mentionedByName)} mentioned you in a sales note on ${escapeHtml(saleTitle)}.</p>
<p><strong>Note:</strong><br>${escapeHtml(noteExcerpt).replace(/\n/g, "<br>")}</p>
<p><a href="${escapeHtml(saleUrl)}">Open the lead in CRM</a></p>
<p>Review the note in the CRM and complete the mention review task when done.</p>`;

  return {
    html,
    subject,
    text,
  };
}
