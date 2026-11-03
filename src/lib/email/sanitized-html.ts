import sanitizeHtml from "sanitize-html";

const emailTags = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const quotedHistoryMarkers = [
  /<div\b[^>]*\bclass=(?:"[^"]*\bgmail_quote\b[^"]*"|'[^']*\bgmail_quote\b[^']*')[^>]*>/i,
  /<div\b[^>]*\bclass=(?:"[^"]*\byahoo_quoted\b[^"]*"|'[^']*\byahoo_quoted\b[^']*')[^>]*>/i,
  /<div\b[^>]*\bid=(?:"divRplyFwdMsg"|'divRplyFwdMsg')[^>]*>/i,
  /<blockquote\b/i,
];

function withoutQuotedHistory(html: string) {
  const markerIndexes = quotedHistoryMarkers
    .map((pattern) => html.search(pattern))
    .filter((index) => index >= 0);

  return markerIndexes.length ? html.slice(0, Math.min(...markerIndexes)) : html;
}

export function sanitizedEmailHtml(
  html: string | null | undefined,
  options: { includeQuotedHistory?: boolean } = {},
) {
  if (!html?.trim()) return null;

  const source = options.includeQuotedHistory ? html : withoutQuotedHistory(html);
  const sanitized = sanitizeHtml(source, {
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "title", "rel", "target"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "font-style": [/^(?:italic|normal)$/],
        "font-weight": [/^(?:bold|normal|[1-9]00)$/],
        "text-align": [/^(?:center|justify|left|right)$/],
        "text-decoration": [/^(?:line-through|none|underline)$/],
      },
    },
    allowedTags: emailTags,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
    },
  }).trim();

  return sanitized || null;
}

export function sanitizedEmailHtmlViews({
  fullText,
  html,
  latestText,
}: {
  fullText: string;
  html: string | null | undefined;
  latestText: string;
}) {
  const latestHtml = sanitizedEmailHtml(html);
  const fullHtml = sanitizedEmailHtml(html, { includeQuotedHistory: true });
  const hasDistinctTextHistory = Boolean(
    fullText && latestText && fullText !== latestText,
  );

  return {
    fullHtml,
    latestHtml:
      hasDistinctTextHistory && latestHtml === fullHtml ? null : latestHtml,
  };
}
