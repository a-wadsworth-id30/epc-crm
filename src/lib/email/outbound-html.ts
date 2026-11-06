import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "i",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "u",
  "ul",
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextToEmailHtml(value: string) {
  return value
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function sanitizeOutboundEmailHtml(
  html: string | null | undefined,
  plainText: string,
) {
  const source = html?.trim() || plainTextToEmailHtml(plainText);
  const sanitized = sanitizeHtml(source, {
    allowedAttributes: { a: ["href", "rel", "target", "title"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    allowedTags,
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

  return sanitized || plainTextToEmailHtml(plainText);
}
