const maxFileAssetTags = 20;
const maxFileAssetTagLength = 40;
const maxFileAssetNotesLength = 2000;

export function normaliseFileAssetNotes(value: unknown) {
  if (typeof value !== "string") return null;

  const notes = value.trim();
  return notes ? notes.slice(0, maxFileAssetNotesLength) : null;
}

export function parseFileAssetTags(value: unknown) {
  if (typeof value !== "string") return [];

  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of value.split(/[,\n]/)) {
    const tag = item.replace(/\s+/g, " ").trim().slice(0, maxFileAssetTagLength);
    const key = tag.toLowerCase();

    if (!tag || seen.has(key)) continue;

    seen.add(key);
    tags.push(tag);

    if (tags.length >= maxFileAssetTags) break;
  }

  return tags;
}

export function fileAssetTagsText(tags: readonly string[] | null | undefined) {
  return tags?.join(", ") ?? "";
}
