"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { syncPipedriveLeadFilesOnSaleViewAction } from "@/lib/actions/sales";

export type PipedriveLeadFilesAutoSyncProps = {
  saleId: string;
};

export default function PipedriveLeadFilesAutoSync({
  saleId,
}: PipedriveLeadFilesAutoSyncProps) {
  const router = useRouter();
  const didRequestSync = useRef(false);

  useEffect(() => {
    if (didRequestSync.current) return;

    didRequestSync.current = true;
    let cancelled = false;

    syncPipedriveLeadFilesOnSaleViewAction(saleId)
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
