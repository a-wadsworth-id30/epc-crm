"use client";

import { useActionState, useState } from "react";
import { Download, RotateCcw, Search } from "lucide-react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import {
  backfillPipedriveLinkedSalesAction,
  type PipedriveLinkedSaleBackfillActionState,
} from "@/lib/actions/integrations";

const initialState: PipedriveLinkedSaleBackfillActionState = {
  linkedSales: null,
  message: "",
  mode: null,
  moreAvailable: false,
  nextCursor: null,
  ok: false,
  processed: null,
  recordsRead: null,
  recordsWritten: null,
  savedAt: null,
  status: null,
  unlinkedSales: null,
};

export default function PipedriveLinkedSaleBackfillForm({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [cursor, setCursor] = useState("");
  const [state, formAction, isPending] = useActionState(
    backfillPipedriveLinkedSalesAction,
    initialState,
  );

  const canUseNextCursor = Boolean(state.nextCursor);
  const hasCursor = Boolean(cursor);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="cursor" value={cursor} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="pipedrive-backfill-limit">Batch size</Label>
          <Input
            id="pipedrive-backfill-limit"
            name="limit"
            type="number"
            min="1"
            max="25"
            defaultValue="10"
            disabled={disabled || isPending}
          />
        </div>
        <div>
          <Label htmlFor="pipedrive-backfill-file-pages">
            Scan pages
          </Label>
          <Input
            id="pipedrive-backfill-file-pages"
            name="fileMaxPages"
            type="number"
            min="1"
            max="10"
            defaultValue="10"
            disabled={disabled || isPending}
          />
        </div>
      </div>

      {hasCursor || canUseNextCursor ? (
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {hasCursor ? "Continuing from saved cursor." : "Next cursor ready."}
          </span>
          <div className="flex flex-wrap gap-2">
            {canUseNextCursor ? (
              <button
                type="button"
                disabled={disabled || isPending}
                onClick={() => setCursor(state.nextCursor ?? "")}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Use next cursor
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled || isPending || !hasCursor}
              onClick={() => setCursor("")}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Start again
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          name="mode"
          value="preview"
          disabled={disabled || isPending}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {isPending ? "Checking" : "Preview batch"}
        </button>
        <button
          type="submit"
          name="mode"
          value="import"
          disabled={disabled || isPending}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {isPending ? "Pulling" : "Pull notes & files"}
        </button>
      </div>

      {state.savedAt !== null ? (
        <div className="space-y-3">
          <ActionStateMessage state={state} />
          <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <BackfillStat label="Linked sales" value={state.linkedSales} />
            <BackfillStat label="Processed" value={state.processed} />
            <BackfillStat label="Records read" value={state.recordsRead} />
            <BackfillStat label="CRM writes" value={state.recordsWritten} />
          </dl>
        </div>
      ) : null}
    </form>
  );
}

function BackfillStat({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.02]">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-gray-800 dark:text-white/90">
        {value === null ? "-" : value.toLocaleString("en-GB")}
      </dd>
    </div>
  );
}
