"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";

type AddressSuggestion = {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
};

type AddressLookupResponse = {
  ok: boolean;
  message?: string;
  suggestions?: AddressSuggestion[];
};

const fieldNames = [
  "addressLine1",
  "addressLine2",
  "city",
  "county",
  "postcode",
  "country",
] as const;

function setInputValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);

  if (!(field instanceof HTMLInputElement)) return;

  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function AddressLookupControl({
  enabled,
  id,
  onDirty,
}: {
  enabled: boolean;
  id: string;
  onDirty?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!enabled || trimmedQuery.length < 3) {
      setSuggestions([]);
      setMessage(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/integrations/geoapify/address/autocomplete?q=${encodeURIComponent(
            trimmedQuery,
          )}&limit=6`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const payload = (await response.json()) as AddressLookupResponse;

        if (!response.ok || !payload.ok) {
          setSuggestions([]);
          setMessage(payload.message ?? "Address lookup is unavailable.");
          return;
        }

        setSuggestions(payload.suggestions ?? []);
        setMessage(
          payload.suggestions?.length ? null : "No matching addresses found.",
        );
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error("Address lookup request failed", error);
        setSuggestions([]);
        setMessage("Address lookup is unavailable.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [enabled, query]);

  if (!enabled) return null;

  function selectSuggestion(suggestion: AddressSuggestion) {
    const form = containerRef.current?.closest("form");
    if (!form) return;

    fieldNames.forEach((name) => {
      setInputValue(form, name, suggestion[name]);
    });
    setQuery("");
    setSuggestions([]);
    setMessage(null);
    onDirty?.();
  }

  return (
    <div ref={containerRef} className="relative md:col-span-2">
      <Label htmlFor={id}>Find address</Label>
      <div className="relative">
        <Input
          id={id}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing an address or postcode"
          autoComplete="off"
          className="pr-11"
          data-address-lookup="true"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 inline-flex -translate-y-1/2 text-gray-400">
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
        </span>
      </div>
      {suggestions.length ? (
        <div className="absolute z-99999 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => selectSuggestion(suggestion)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:hover:bg-white/[0.05] dark:focus:bg-white/[0.05]"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand-500" />
              <span className="min-w-0">
                <span className="block font-medium text-gray-800 dark:text-white/90">
                  {suggestion.addressLine1 || suggestion.label}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {suggestion.label}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}
