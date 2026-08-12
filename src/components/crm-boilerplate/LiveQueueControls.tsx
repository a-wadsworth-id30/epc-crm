"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  endQueuedCallAction,
  markQueuedCallMissedAction,
} from "@/lib/actions/call-routing";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

type ActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const initialState: ActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

export type LiveQueueTimerProps = {
  queuedAt: string;
};

export type QueueCallAdminActionsProps = {
  canAct?: boolean;
  queueEntryId: string;
};

export function LiveQueueTimer({ queuedAt }: LiveQueueTimerProps) {
  const startedAt = useMemo(() => new Date(queuedAt).getTime(), [queuedAt]);
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <span className="font-semibold text-gray-800 dark:text-white/90">
      {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

export function QueueCallAdminActions({
  canAct = true,
  queueEntryId,
}: QueueCallAdminActionsProps) {
  const { showToast } = useToast();
  const [missedState, missedAction, isMarkingMissed] = useActionState(
    markQueuedCallMissedAction,
    initialState,
  );
  const [endState, endAction, isEnding] = useActionState(
    endQueuedCallAction,
    initialState,
  );

  useEffect(() => {
    if (!missedState.message || missedState.savedAt === null) return;
    showToast(missedState.message, missedState.ok ? "success" : "error");
  }, [missedState, showToast]);

  useEffect(() => {
    if (!endState.message || endState.savedAt === null) return;
    showToast(endState.message, endState.ok ? "success" : "error");
  }, [endState, showToast]);

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <form action={missedAction}>
        <input type="hidden" name="queueEntryId" value={queueEntryId} />
        <button
          type="submit"
          disabled={!canAct || isMarkingMissed}
          className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-warning-200 px-3 text-xs font-semibold text-warning-700 hover:bg-warning-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-warning-900/50 dark:text-warning-300 dark:hover:bg-warning-900/20"
        >
          {isMarkingMissed ? "Marking..." : "Mark missed"}
        </button>
      </form>
      <form action={endAction}>
        <input type="hidden" name="queueEntryId" value={queueEntryId} />
        <button
          type="submit"
          disabled={!canAct || isEnding}
          className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-error-200 px-3 text-xs font-semibold text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/50 dark:text-error-300 dark:hover:bg-error-900/20"
        >
          {isEnding ? "Ending..." : "End call"}
        </button>
      </form>
    </div>
  );
}
