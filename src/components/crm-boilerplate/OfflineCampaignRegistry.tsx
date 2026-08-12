"use client";

import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  updateOfflineCampaignAction,
  type OfflineCampaignActionState,
} from "@/lib/actions/offline-campaigns";
import {
  offlineCampaignChannelLabels,
  offlineCampaignChannels,
  offlineCampaignStatusLabels,
  offlineCampaignStatuses,
  type OfflineCampaignStatusValue,
} from "@/lib/marketing/offline-campaigns";
import type { OfflineCampaignRow } from "@/components/crm-boilerplate/OfflineCampaignsPanel";

const initialState: OfflineCampaignActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

const compactFieldClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

export default function OfflineCampaignRegistry({
  campaigns,
  unavailable = false,
}: {
  campaigns: OfflineCampaignRow[];
  unavailable?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Campaign registry
          </h2>
          <LazyHelpTooltip content="Stores source fields and commercial planning metadata for offline campaigns." />
        </div>
      </div>

      {unavailable ? (
        <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
          Campaign registry is unavailable until the database migration has been applied.
        </p>
      ) : campaigns.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[1320px]">
            <div className="grid grid-cols-[1.5fr_180px_210px_210px_200px_160px] gap-4 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <span>Campaign</span>
              <span>Status</span>
              <span>Source fields</span>
              <span>Schedule</span>
              <span>Cost</span>
              <span>Links</span>
            </div>
            {campaigns.map((campaign) => (
              <CampaignEditor key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </div>
      ) : (
        <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
          No offline campaigns have been added yet.
        </p>
      )}
    </section>
  );
}

function CampaignEditor({ campaign }: { campaign: OfflineCampaignRow }) {
  const { showToast } = useToast();
  const [state, action, isPending] = useActionState(
    updateOfflineCampaignAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok && state.savedAt) {
      showToast(state.message || "Offline campaign updated.");
    }
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <form
      action={action}
      className="border-b border-gray-100 px-5 py-4 last:border-b-0 dark:border-gray-800"
    >
      <input type="hidden" name="id" value={campaign.id} />
      <div className="grid grid-cols-[1.5fr_180px_210px_210px_200px_160px] gap-4">
        <div className="space-y-2">
          <input name="name" defaultValue={campaign.name} required className={compactFieldClass} />
          <input name="code" defaultValue={campaign.code} required className={compactFieldClass} />
          <input
            name="destinationUrl"
            defaultValue={campaign.destinationUrl ?? ""}
            placeholder="Destination URL"
            className={compactFieldClass}
          />
          <textarea
            name="notes"
            defaultValue={campaign.notes ?? ""}
            rows={2}
            placeholder="Notes"
            className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
          />
        </div>

        <div className="space-y-2">
          <select name="status" defaultValue={campaign.status} className={compactFieldClass}>
            {offlineCampaignStatuses.map((status) => (
              <option key={status} value={status}>
                {offlineCampaignStatusLabels[status]}
              </option>
            ))}
          </select>
          <select name="channel" defaultValue={campaign.channel} className={compactFieldClass}>
            {offlineCampaignChannels.map((channel) => (
              <option key={channel} value={channel}>
                {offlineCampaignChannelLabels[channel]}
              </option>
            ))}
          </select>
          <StatusBadge status={campaign.status} />
        </div>

        <div className="space-y-2">
          <input name="source" defaultValue={campaign.source} required className={compactFieldClass} />
          <input name="medium" defaultValue={campaign.medium} className={compactFieldClass} />
          <input name="campaign" defaultValue={campaign.campaign} required className={compactFieldClass} />
          <input name="content" defaultValue={campaign.content ?? ""} placeholder="Content" className={compactFieldClass} />
          <input name="term" defaultValue={campaign.term ?? ""} placeholder="Term" className={compactFieldClass} />
        </div>

        <div className="space-y-2">
          <input
            name="startDate"
            type="date"
            defaultValue={dateInputValue(campaign.startDate)}
            className={compactFieldClass}
          />
          <input
            name="endDate"
            type="date"
            defaultValue={dateInputValue(campaign.endDate)}
            className={compactFieldClass}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Updated {formatDate(campaign.updatedAt)}
          </p>
        </div>

        <div className="space-y-2">
          <input
            name="budgetPounds"
            inputMode="decimal"
            defaultValue={centsToPounds(campaign.budgetCents)}
            placeholder="Budget"
            className={compactFieldClass}
          />
          <input
            name="actualCostPounds"
            inputMode="decimal"
            defaultValue={centsToPounds(campaign.actualCostCents)}
            placeholder="Actual"
            className={compactFieldClass}
          />
          <input
            name="currency"
            defaultValue={campaign.currency}
            maxLength={3}
            className={compactFieldClass}
          />
        </div>

        <div className="space-y-3">
          <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
            <p>{campaign.trackingNumbersCount} numbers</p>
            <p>{campaign.attributionRecordsCount} records</p>
            <p>{campaign.touchpointsCount} touchpoints</p>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-brand-500 px-3 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-500/10"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
          <ActionStateMessage state={state.ok ? undefined : state} />
        </div>
      </div>
    </form>
  );
}

function StatusBadge({ status }: { status: OfflineCampaignStatusValue }) {
  const className =
    status === "ACTIVE"
      ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
      : status === "ARCHIVED"
        ? "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
        : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";

  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {offlineCampaignStatusLabels[status]}
    </span>
  );
}

function centsToPounds(value: number | null) {
  if (value === null) return "";
  return (value / 100).toFixed(2).replace(/\.00$/, "");
}

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
