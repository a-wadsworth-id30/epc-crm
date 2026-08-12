"use client";

import { useActionState, useEffect } from "react";
import { routeQueuedCallAction } from "@/lib/actions/call-routing";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

type RouteAgent = {
  id: string;
  name: string;
};

export default function CallRouteForm({
  queueEntryId,
  agents,
  disabled = false,
}: {
  queueEntryId: string;
  agents: RouteAgent[];
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(routeQueuedCallAction, {
    ok: false,
    message: "",
    savedAt: null,
  });

  useEffect(() => {
    if (!state.message || state.savedAt === null) {
      return;
    }

    showToast(state.message, state.ok ? "success" : "error");
  }, [showToast, state.message, state.ok, state.savedAt]);

  if (!agents.length) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-500">
        No available agents
      </span>
    );
  }

  return (
    <form action={formAction} className="flex min-w-[220px] items-center gap-2">
      <input type="hidden" name="queueEntryId" value={queueEntryId} />
      <select
        name="targetUserId"
        disabled={disabled || isPending}
        className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
      >
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={disabled || isPending}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Routing" : "Route"}
      </button>
    </form>
  );
}
