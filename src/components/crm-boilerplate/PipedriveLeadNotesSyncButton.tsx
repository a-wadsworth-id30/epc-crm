"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { syncPipedriveLeadNotesAction } from "@/lib/actions/sales";

export type PipedriveLeadNotesSyncButtonProps = {
  saleId: string;
};

export default function PipedriveLeadNotesSyncButton({
  saleId,
}: PipedriveLeadNotesSyncButtonProps) {
  const router = useRouter();
  const [state, action, isPending] = useActionState(
    syncPipedriveLeadNotesAction,
    { ok: false, message: "" },
  );

  useEffect(() => {
    if (!state.ok) return;

    router.refresh();
  }, [router, state.ok]);

  return (
    <form action={action} className="flex flex-col items-start gap-1 sm:items-end">
      <input type="hidden" name="saleId" value={saleId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300 dark:hover:bg-brand-900/30"
      >
        <RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Pulling notes" : "Pull Pipedrive notes"}
      </button>
      {state.message ? (
        <div className="max-w-72 text-left sm:text-right">
          <ActionStateMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}
