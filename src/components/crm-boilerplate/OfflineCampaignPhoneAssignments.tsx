"use client";

import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  updateOfflineCampaignPhoneAssignmentAction,
  type OfflineCampaignActionState,
} from "@/lib/actions/offline-campaigns";
import { offlineCampaignStatusLabels } from "@/lib/marketing/offline-campaigns";
import type {
  OfflineCampaignRow,
  OfflineTrackingNumberRow,
} from "@/components/crm-boilerplate/OfflineCampaignsPanel";

const initialState: OfflineCampaignActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

export default function OfflineCampaignPhoneAssignments({
  campaigns,
  trackingNumbers,
}: {
  campaigns: OfflineCampaignRow[];
  trackingNumbers: OfflineTrackingNumberRow[];
}) {
  const assignedNumbers = trackingNumbers.filter((number) => number.offlineCampaignId).length;
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  const campaignsWithNumbers = campaigns.filter((campaign) =>
    trackingNumbers.some((number) => number.offlineCampaignId === campaign.id),
  );
  const activeCampaignsWithoutNumbers = activeCampaigns.filter(
    (campaign) => !trackingNumbers.some((number) => number.offlineCampaignId === campaign.id),
  );
  const activePoolNumbers = trackingNumbers.filter((number) => number.isActive).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Phone-number assignment
          </h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {assignedNumbers}/{trackingNumbers.length} assigned
          </span>
        </div>
      </div>

      <div className="grid gap-3 border-b border-gray-200 p-5 sm:grid-cols-2 xl:grid-cols-4 dark:border-gray-800">
        <AssignmentMetric
          label="Active campaigns"
          value={activeCampaigns.length.toString()}
        />
        <AssignmentMetric
          label="Campaigns covered"
          value={`${campaignsWithNumbers.length}/${campaigns.length}`}
        />
        <AssignmentMetric
          label="Need number"
          value={activeCampaignsWithoutNumbers.length.toString()}
        />
        <AssignmentMetric
          label="Active pool"
          value={`${activePoolNumbers}/${trackingNumbers.length}`}
        />
      </div>

      {campaigns.length ? (
        <CampaignCoverage campaigns={campaigns} trackingNumbers={trackingNumbers} />
      ) : null}

      {trackingNumbers.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[minmax(220px,1fr)_160px_minmax(260px,1.2fr)_120px] gap-4 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <span>Tracking number</span>
              <span>Status</span>
              <span>Offline campaign</span>
              <span>Action</span>
            </div>
            {trackingNumbers.map((trackingNumber) => (
              <PhoneAssignmentRow
                key={trackingNumber.id}
                campaigns={campaigns}
                trackingNumber={trackingNumber}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
          No tracking pool numbers are available.
        </p>
      )}
    </section>
  );
}

function AssignmentMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function CampaignCoverage({
  campaigns,
  trackingNumbers,
}: {
  campaigns: OfflineCampaignRow[];
  trackingNumbers: OfflineTrackingNumberRow[];
}) {
  const visibleCampaigns = campaigns.filter(
    (campaign) => campaign.status === "ACTIVE" || campaign.trackingNumbersCount > 0,
  );

  if (!visibleCampaigns.length) return null;

  return (
    <div className="border-b border-gray-200 p-5 dark:border-gray-800">
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {visibleCampaigns.map((campaign) => {
          const numbers = trackingNumbers.filter(
            (number) => number.offlineCampaignId === campaign.id,
          );
          const activeNumbers = numbers.filter((number) => number.isActive);
          const covered = activeNumbers.length > 0;

          return (
            <div
              key={campaign.id}
              className="min-w-0 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                    {campaign.name}
                  </p>
                  <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                    {campaign.code}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    covered
                      ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                      : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
                  }`}
                >
                  {covered ? "Covered" : "Needs number"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                  {offlineCampaignStatusLabels[campaign.status]}
                </span>
                {numbers.length ? (
                  numbers.map((number) => (
                    <span
                      key={number.id}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        number.isActive
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
                          : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                      }`}
                    >
                      {number.phoneNumber}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                    No tracking number
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhoneAssignmentRow({
  campaigns,
  trackingNumber,
}: {
  campaigns: OfflineCampaignRow[];
  trackingNumber: OfflineTrackingNumberRow;
}) {
  const { showToast } = useToast();
  const [state, action, isPending] = useActionState(
    updateOfflineCampaignPhoneAssignmentAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok && state.savedAt) {
      showToast(state.message || "Phone assignment updated.");
    }
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <form
      action={action}
      className="border-b border-gray-100 px-5 py-4 last:border-b-0 dark:border-gray-800"
    >
      <input type="hidden" name="phoneNumberId" value={trackingNumber.id} />
      <div className="grid grid-cols-[minmax(220px,1fr)_160px_minmax(260px,1.2fr)_120px] gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {trackingNumber.phoneNumber}
          </p>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
            {trackingNumber.label || trackingNumber.destinationNumber || "No label"}
          </p>
        </div>

        <div>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              trackingNumber.isActive
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
            }`}
          >
            {trackingNumber.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        <div>
          <select
            name="offlineCampaignId"
            defaultValue={trackingNumber.offlineCampaignId ?? ""}
            className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
          >
            <option value="">No campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} / {campaign.code}
              </option>
            ))}
          </select>
          <div className="mt-2">
            <ActionStateMessage state={state.ok ? undefined : state} />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-500 px-3 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-500/10"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
