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
  "img",
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
  /<div\b[^>]*\bclass=(?:"[^"]*\bgmail_attr\b[^"]*"|'[^']*\bgmail_attr\b[^']*')[^>]*>/i,
  /<div\b[^>]*\bclass=(?:"[^"]*\byahoo_quoted\b[^"]*"|'[^']*\byahoo_quoted\b[^']*')[^>]*>/i,
  /<(?:div|span)\b[^>]*\bclass=(?:"[^"]*\bmoz-cite-prefix\b[^"]*"|'[^']*\bmoz-cite-prefix\b[^']*')[^>]*>/i,
  /<(?:div|blockquote)\b[^>]*\bclass=(?:"[^"]*\bprotonmail_quote\b[^"]*"|'[^']*\bprotonmail_quote\b[^']*')[^>]*>/i,
  /<(?:div|table)\b[^>]*\bclass=(?:"[^"]*\bOutlookMessageHeader\b[^"]*"|'[^']*\bOutlookMessageHeader\b[^']*')[^>]*>/i,
  /<div\b[^>]*\bid=(?:"divRplyFwdMsg"|'divRplyFwdMsg')[^>]*>/i,
  /<(?:div|p)\b[^>]*>\s*-{2,}\s*(?:Original|Forwarded) Message\s*-{2,}/i,
  /<blockquote\b[^>]*(?:type=(?:"cite"|'cite')|class=(?:"[^"]*\b(?:gmail_quote|protonmail_quote)\b[^"]*"|'[^']*\b(?:gmail_quote|protonmail_quote)\b[^']*'))[^>]*>/i,
];

export type InlineEmailImage = {
  contentId: string;
  previewUrl: string;
};

function quotedHistoryStart(html: string) {
  const markerIndexes = quotedHistoryMarkers
    .map((pattern) => html.search(pattern))
    .filter((index) => index >= 0);

  return markerIndexes.length ? Math.min(...markerIndexes) : -1;
}

function splitEmailHtml(html: string) {
  const index = quotedHistoryStart(html);
  if (index <= 0) return { latest: html, quotedHistory: null };

  const latest = html.slice(0, index).trim();
  const quotedHistory = html.slice(index).trim();

  return latest && quotedHistory
    ? { latest, quotedHistory }
    : { latest: html, quotedHistory: null };
}

function normalizedContentId(value: string | null | undefined) {
  return value
    ?.trim()
    .replace(/^cid:/i, "")
    .replace(/^<|>$/g, "")
    .toLowerCase();
}

function sanitizedSource(
  source: string,
  inlineImages: InlineEmailImage[] = [],
) {
  const imageByContentId = new Map(
    inlineImages.flatMap((image) => {
      const contentId = normalizedContentId(image.contentId);
      return contentId ? [[contentId, image.previewUrl] as const] : [];
    }),
  );

  return sanitizeHtml(source, {
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "title", "rel", "target"],
      img: ["alt", "height", "src", "title", "width"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        color: [
          /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]{3,20})$/i,
        ],
        "font-style": [/^(?:italic|normal)$/],
        "font-weight": [/^(?:bold|normal|[1-9]00)$/],
        "text-align": [/^(?:center|justify|left|right)$/],
        "text-decoration": [/^(?:line-through|none|underline)$/],
      },
    },
    allowedTags: emailTags,
    disallowedTagsMode: "discard",
    exclusiveFilter: (frame) =>
      frame.tag === "img" && !frame.attribs.src,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      img: (_tagName, attributes) => {
        const contentId = normalizedContentId(attributes.src);
        const previewUrl = contentId
          ? imageByContentId.get(contentId)
          : null;

        return {
          tagName: "img",
          attribs: previewUrl
            ? {
                alt: attributes.alt ?? "Embedded email image",
                src: previewUrl,
                ...(attributes.height ? { height: attributes.height } : {}),
                ...(attributes.title ? { title: attributes.title } : {}),
                ...(attributes.width ? { width: attributes.width } : {}),
              }
            : {},
        };
      },
    },
  }).trim();
}

export function sanitizedEmailHtml(
  html: string | null | undefined,
  options: {
    includeQuotedHistory?: boolean;
    inlineImages?: InlineEmailImage[];
  } = {},
) {
  if (!html?.trim()) return null;

  const source = options.includeQuotedHistory
    ? html
    : splitEmailHtml(html).latest;
  const sanitized = sanitizedSource(source, options.inlineImages);

  return sanitized || null;
}

export function sanitizedEmailHtmlViews({
  html,
  inlineImages = [],
}: {
  fullText?: string;
  html: string | null | undefined;
  inlineImages?: InlineEmailImage[];
  latestText?: string;
}) {
  if (!html?.trim()) {
    return {
      fullHtml: null,
      latestHtml: null,
      quotedHistoryHtml: null,
    };
  }

  const split = splitEmailHtml(html);
  const fullHtml = sanitizedSource(html, inlineImages) || null;
  const latestHtml = sanitizedSource(split.latest, inlineImages) || fullHtml;
  const quotedHistoryHtml = split.quotedHistory
    ? sanitizedSource(split.quotedHistory, inlineImages) || null
    : null;

  return {
    fullHtml,
    latestHtml,
    quotedHistoryHtml:
      quotedHistoryHtml && quotedHistoryHtml !== latestHtml
        ? quotedHistoryHtml
        : null,
  };
}
