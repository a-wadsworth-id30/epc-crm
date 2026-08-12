"use client";

import { useMemo, useRef, useState } from "react";
import Label from "@/components/form/Label";
import { CloseIcon } from "@/icons";

export type ContactTagOption = {
  id: string;
  name: string;
};

function normaliseTag(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanTagName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

function dedupeTags(tags: string[]) {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const tag of tags) {
    const name = cleanTagName(tag);
    const key = normaliseTag(name);

    if (!name || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    values.push(name);
  }

  return values;
}

export default function ContactTagInput({
  id,
  availableTags,
  defaultTags,
  onDirty,
}: {
  id: string;
  availableTags: ContactTagOption[];
  defaultTags?: string[];
  onDirty?: () => void;
}) {
  const defaultTagNames = useMemo(() => dedupeTags(defaultTags ?? []), [defaultTags]);
  const [selectedTags, setSelectedTags] = useState(defaultTagNames);
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedKeys = useMemo(
    () => new Set(selectedTags.map((tag) => normaliseTag(tag))),
    [selectedTags],
  );

  const suggestedTags = useMemo(() => {
    const search = normaliseTag(query);

    return availableTags
      .filter((tag) => {
        const key = normaliseTag(tag.name);
        return key && !selectedKeys.has(key) && (!search || key.includes(search));
      })
      .slice(0, 6);
  }, [availableTags, query, selectedKeys]);

  function addTag(value: string) {
    const cleanValue = cleanTagName(value);
    const key = normaliseTag(cleanValue);

    if (!cleanValue || !key || selectedKeys.has(key)) {
      setQuery("");
      return;
    }

    const existingTag = availableTags.find((tag) => normaliseTag(tag.name) === key);
    setSelectedTags((current) => [...current, existingTag?.name ?? cleanValue]);
    setQuery("");
    onDirty?.();
  }

  function removeTag(value: string) {
    const key = normaliseTag(value);
    setSelectedTags((current) => current.filter((tag) => normaliseTag(tag) !== key));
    onDirty?.();
  }

  function addFromQuery() {
    if (!query.trim()) {
      return;
    }

    if (suggestedTags.length) {
      addTag(suggestedTags[0].name);
      return;
    }

    addTag(query);
  }

  const showSuggestions = isFocused && Boolean(query.trim() || suggestedTags.length);

  return (
    <div className="md:col-span-2">
      <Label htmlFor={id}>Tags</Label>
      <input type="hidden" name="tagNames" value={JSON.stringify(selectedTags)} readOnly />
      <div className="relative">
        <div className="min-h-11 rounded-lg border border-gray-300 bg-white px-2.5 py-2 shadow-theme-xs focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-wrap items-center gap-2">
            {selectedTags.map((tag) => (
              <span
                key={normaliseTag(tag)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-2.5 text-xs font-medium text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-200"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-brand-500 hover:bg-brand-100 hover:text-brand-700 dark:text-brand-200 dark:hover:bg-brand-900/50"
                >
                  <CloseIcon className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <input
              id={id}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => {
                if (blurTimerRef.current) {
                  clearTimeout(blurTimerRef.current);
                }
                setIsFocused(true);
              }}
              onBlur={() => {
                blurTimerRef.current = setTimeout(() => setIsFocused(false), 120);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addFromQuery();
                }

                if (event.key === "Backspace" && !query && selectedTags.length) {
                  event.preventDefault();
                  removeTag(selectedTags[selectedTags.length - 1]);
                }
              }}
              placeholder={selectedTags.length ? "Add another tag" : "Start typing a tag"}
              className="h-7 min-w-36 flex-1 border-0 bg-transparent px-1 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-hidden dark:text-white/90"
            />
          </div>
        </div>

        {showSuggestions && (
          <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
            {suggestedTags.length ? (
              suggestedTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addTag(tag.name)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 dark:text-gray-300 dark:hover:bg-brand-900/20 dark:hover:text-brand-200"
                >
                  <span className="font-medium">{tag.name}</span>
                  <span className="text-xs text-gray-400">Existing tag</span>
                </button>
              ))
            ) : (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(query)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <span>Add &quot;{cleanTagName(query)}&quot;</span>
                <span className="text-xs text-gray-400">New tag</span>
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        Existing tags appear as you type. Press Enter to select the closest match.
      </p>
    </div>
  );
}
