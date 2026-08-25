"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { syncPipedriveLeadEmailsAction } from "@/lib/actions/sales";

export type PipedriveLeadEmailsSyncButtonProps = {
  saleId: string;
};

const initialState = { ok: false, message: "" };

export default function PipedriveLeadEmailsSyncButton({
  saleId,
}: PipedriveLeadEmailsSyncButtonProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    syncPipedriveLeadEmailsAction,
    initialState,
  );

  useEffect(() => {
    if (!state.ok) return;

    router.refresh();
  }, [router, state.ok]);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1 sm:items-end">
      <input type="hidden" name="saleId" value={saleId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]"
      >
        <RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Pulling emails" : "Pull Pipedrive emails"}
      </button>
      {state.message ? (
        <div className="max-w-72 text-left sm:text-right">
          <ActionStateMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}
