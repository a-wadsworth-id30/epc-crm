"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { syncPipedriveLeadEmailsOnSaleViewAction } from "@/lib/actions/sales";

export type PipedriveLeadEmailsAutoSyncProps = {
  saleId: string;
};

export default function PipedriveLeadEmailsAutoSync({
  saleId,
}: PipedriveLeadEmailsAutoSyncProps) {
  const router = useRouter();
  const didRequestSync = useRef(false);

  useEffect(() => {
    if (didRequestSync.current) return;

    didRequestSync.current = true;
    let cancelled = false;

    syncPipedriveLeadEmailsOnSaleViewAction(saleId)
      .then((result) => {
        if (!cancelled && result.ok && result.refreshed) {
          router.refresh();
        }
      })
      .catch(() => {
        // Sale loading should not be blocked by a best-effort Pipedrive refresh.
      });

    return () => {
      cancelled = true;
    };
  }, [router, saleId]);

  return null;
}
