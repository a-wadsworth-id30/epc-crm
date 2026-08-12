"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, type ComponentType } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  createOfflineCampaignAction,
  type OfflineCampaignActionState,
} from "@/lib/actions/offline-campaigns";
import {
  offlineCampaignChannelLabels,
  offlineCampaignChannels,
  offlineCampaignStatusLabels,
  offlineCampaignStatuses,
  type OfflineCampaignChannelValue,
  type OfflineCampaignStatusValue,
} from "@/lib/marketing/offline-campaigns";

export type OfflineCampaignRow = {
  id: string;
  name: string;
  code: string;
  channel: OfflineCampaignChannelValue;
  status: OfflineCampaignStatusValue;
  source: string;
  medium: string;
  campaign: string;
  content: string | null;
  term: string | null;
  destinationUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetCents: number | null;
  actualCostCents: number | null;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  trackingNumbersCount: number;
  attributionRecordsCount: number;
  touchpointsCount: number;
};

const initialState: OfflineCampaignActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

const fieldClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

export type OfflineTrackingNumberRow = {
  id: string;
  phoneNumber: string;
  label: string | null;
  destinationNumber: string | null;
  isActive: boolean;
  priority: number;
  offlineCampaignId: string | null;
};

type OfflineCampaignQrToolsProps = {
  campaigns: OfflineCampaignRow[];
};

type OfflineCampaignPhoneAssignmentsProps = {
  campaigns: OfflineCampaignRow[];
  trackingNumbers: OfflineTrackingNumberRow[];
};

type OfflineCampaignRegistryProps = {
  campaigns: OfflineCampaignRow[];
  unavailable?: boolean;
};

export type OfflineCampaignsPanelProps = {
  campaigns: OfflineCampaignRow[];
  trackingNumbers: OfflineTrackingNumberRow[];
  unavailable?: boolean;
};

const OfflineCampaignQrTools = dynamic(
  () => import("@/components/crm-boilerplate/OfflineCampaignQrTools"),
  {
    ssr: false,
    loading: () => <OfflineToolSkeleton title="QR campaign generator" />,
  },
) as ComponentType<OfflineCampaignQrToolsProps>;

const OfflineCampaignPhoneAssignments = dynamic(
  () => import("@/components/crm-boilerplate/OfflineCampaignPhoneAssignments"),
  {
    ssr: false,
    loading: () => <OfflineToolSkeleton title="Phone-number assignment" />,
  },
) as ComponentType<OfflineCampaignPhoneAssignmentsProps>;

const OfflineCampaignRegistry = dynamic(
  () => import("@/components/crm-boilerplate/OfflineCampaignRegistry"),
  {
    ssr: false,
    loading: () => <OfflineToolSkeleton title="Campaign registry" />,
  },
) as ComponentType<OfflineCampaignRegistryProps>;

export default function OfflineCampaignsPanel({
  campaigns,
  trackingNumbers,
  unavailable = false,
}: OfflineCampaignsPanelProps) {
  const { showToast } = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createOfflineCampaignAction,
    initialState,
  );

  useEffect(() => {
    if (createState.ok && createState.savedAt) {
      showToast(createState.message || "Offline campaign added.");
    }
  }, [createState.message, createState.ok, createState.savedAt, showToast]);

  return (
    <div className="space-y-6">
      {unavailable ? <UnavailableNotice /> : null}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Add campaign
            </h2>
            <LazyHelpTooltip content="Creates the offline campaign metadata used by later QR, phone-number and reporting workflows." />
          </div>
        </div>

        {unavailable ? (
          <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
            Offline campaign setup is unavailable until the database migration has been applied.
          </p>
        ) : (
          <form action={createAction} className="space-y-5 p-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Name">
                <input name="name" required placeholder="July radio campaign" className={fieldClass} />
              </Field>
              <Field label="Code">
                <input name="code" required placeholder="RADIO-JULY-2026" className={fieldClass} />
              </Field>
              <Field label="Channel">
                <select name="channel" defaultValue="RADIO" className={fieldClass}>
                  {offlineCampaignChannels.map((channel) => (
                    <option key={channel} value={channel}>
                      {offlineCampaignChannelLabels[channel]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <Field label="Status">
                <select name="status" defaultValue="DRAFT" className={fieldClass}>
                  {offlineCampaignStatuses.map((status) => (
                    <option key={status} value={status}>
                      {offlineCampaignStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Source">
                <input name="source" required defaultValue="offline" className={fieldClass} />
              </Field>
              <Field label="Medium">
                <input name="medium" defaultValue="offline" className={fieldClass} />
              </Field>
              <Field label="Campaign">
                <input name="campaign" required placeholder="radio-july" className={fieldClass} />
              </Field>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <Field label="Content">
                <input name="content" placeholder="station-a" className={fieldClass} />
              </Field>
              <Field label="Term">
                <input name="term" placeholder="drive-time" className={fieldClass} />
              </Field>
              <Field label="Start">
                <input name="startDate" type="date" className={fieldClass} />
              </Field>
              <Field label="End">
                <input name="endDate" type="date" className={fieldClass} />
              </Field>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_150px_150px_110px]">
              <Field label="Destination URL">
                <input
                  name="destinationUrl"
                  placeholder="https://example.com/landing-page"
                  className={fieldClass}
                />
              </Field>
              <Field label="Budget">
                <input name="budgetPounds" inputMode="decimal" placeholder="2500" className={fieldClass} />
              </Field>
              <Field label="Actual cost">
                <input name="actualCostPounds" inputMode="decimal" placeholder="2400" className={fieldClass} />
              </Field>
              <Field label="Currency">
                <input name="currency" defaultValue="GBP" maxLength={3} className={fieldClass} />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                name="notes"
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
              />
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <ActionStateMessage state={createState.ok ? undefined : createState} />
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? "Adding..." : "Add campaign"}
              </button>
            </div>
          </form>
        )}
      </section>

      {!unavailable ? <OfflineCampaignQrTools campaigns={campaigns} /> : null}

      {!unavailable ? (
        <OfflineCampaignPhoneAssignments
          campaigns={campaigns}
          trackingNumbers={trackingNumbers}
        />
      ) : null}

      <OfflineCampaignRegistry campaigns={campaigns} unavailable={unavailable} />
    </div>
  );
}

function OfflineToolSkeleton({ title }: { title: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          {title}
        </h2>
      </div>
      <div className="space-y-3 p-5">
        <div className="h-16 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function UnavailableNotice() {
  return (
    <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-sm text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
      Offline campaign setup is unavailable until the latest database migration has been applied.
    </div>
  );
}
