const htmlEntityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\"",
};

export function looksLikeHtml(value: string | null | undefined) {
  if (!value) return false;

  return /<\/?[a-z][\s\S]*>/i.test(value) || /&(?:[a-z]+|#\d+|#x[\da-f]+);/i.test(value);
}

export function htmlToPlainText(value: string | null | undefined) {
  if (!value) return "";

  return cleanPlainText(
    decodeHtmlEntities(
      value
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<\/?(?:br|p|div|li|tr|table|tbody|thead|section|article|h[1-6])\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

export function toEmailPlainText(value: string | null | undefined) {
  if (!value) return "";

  return looksLikeHtml(value) ? htmlToPlainText(value) : cleanPlainText(decodeHtmlEntities(value));
}

export function inboundEmailPlainText({
  fallback,
  html,
  text,
}: {
  fallback?: string | null;
  html?: string | null;
  text?: string | null;
}) {
  return toEmailPlainText(text) || htmlToPlainText(html) || cleanPlainText(fallback ?? "");
}

export function latestEmailReplyText(value: string | null | undefined) {
  const plainText = toEmailPlainText(value);

  if (!plainText) return "";

  const latestLines: string[] = [];
  const lines = plainText.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed && latestLines.length === 0) continue;
    if (isQuotedReplyStart(trimmed, lines, index)) break;

    latestLines.push(line);
  }

  return stripClientSignature(cleanPlainText(latestLines.join("\n"))) || plainText;
}

export function latestInboundEmailPlainText({
  fallback,
  html,
  text,
}: {
  fallback?: string | null;
  html?: string | null;
  text?: string | null;
}) {
  const plainText = inboundEmailPlainText({ fallback, html, text });

  return latestEmailReplyText(plainText) || plainText;
}

export function emailTextSummary(value: string, fallback = "Inbound email received") {
  const trimmed = cleanPlainText(value).replace(/\s+/g, " ");

  if (!trimmed) return fallback;
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function cleanPlainText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isQuotedReplyStart(line: string, lines: string[], index: number) {
  if (!line) return false;
  if (/^>/.test(line)) return true;
  if (/^On .+\bwrote:$/i.test(line)) return true;
  if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(line)) return true;
  if (/^_{5,}$/.test(line)) return true;
  if (/^Begin forwarded message:$/i.test(line)) return true;

  return isOutlookHeaderBlock(line, lines, index);
}

function isOutlookHeaderBlock(line: string, lines: string[], index: number) {
  if (!/^From:\s+/i.test(line)) return false;

  const nextHeaderLines = lines
    .slice(index + 1, index + 8)
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  const hasDateHeader = nextHeaderLines.some((candidate) => /^(Sent|Date):\s+/i.test(candidate));
  const hasRecipientHeader = nextHeaderLines.some((candidate) => /^(To|Cc):\s+/i.test(candidate));
  const hasSubjectHeader = nextHeaderLines.some((candidate) => /^Subject:\s+/i.test(candidate));

  return hasDateHeader && (hasRecipientHeader || hasSubjectHeader);
}

function stripClientSignature(value: string) {
  if (!value) return "";

  const lines = value.split("\n");
  const signatureIndex = lines.findIndex((line) => {
    const trimmed = line.trim();

    return (
      /^--\s*$/.test(trimmed) ||
      /^Get Outlook for (iOS|Android)$/i.test(trimmed) ||
      /^Sent from (my )?(iPhone|iPad|Outlook for (iOS|Android))/i.test(trimmed)
    );
  });

  return signatureIndex > 0 ? cleanPlainText(lines.slice(0, signatureIndex).join("\n")) : value;
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, raw: string) => {
    const key = raw.toLowerCase();

    if (key.startsWith("#x")) {
      return decodeCodepoint(Number.parseInt(key.slice(2), 16), entity);
    }

    if (key.startsWith("#")) {
      return decodeCodepoint(Number.parseInt(key.slice(1), 10), entity);
    }

    return htmlEntityMap[key] ?? entity;
  });
}

function decodeCodepoint(codepoint: number, fallback: string) {
  if (!Number.isFinite(codepoint)) return fallback;

  try {
    return String.fromCodePoint(codepoint);
  } catch {
    return fallback;
  }
}
