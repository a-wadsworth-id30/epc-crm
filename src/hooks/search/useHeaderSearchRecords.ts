"use client";

import { useEffect, useState } from "react";
import type { CrmSearchRecord, CrmSearchResponse } from "@/lib/search/records";

export function useHeaderSearchRecords(query: string) {
  const [records, setRecords] = useState<CrmSearchRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const trimmedQuery = query.trim();
    const digits = trimmedQuery.replace(/\D/g, "");

    if (trimmedQuery.length < 2 && digits.length < 3) {
      setRecords([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/search/records?q=${encodeURIComponent(trimmedQuery)}&limit=6`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error("Record search request failed.");
        }

        const data = (await response.json()) as CrmSearchResponse;
        setRecords(data.records);
      } catch {
        if (!controller.signal.aborted) {
          setRecords([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return { isLoading, records };
}
