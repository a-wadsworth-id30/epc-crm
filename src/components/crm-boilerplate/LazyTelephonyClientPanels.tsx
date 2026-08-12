"use client";

import dynamic from "next/dynamic";
import type { CallRecordingSettingsFormProps } from "@/components/crm-boilerplate/CallRecordingSettingsForm";
import type {
  LiveQueueTimerProps,
  QueueCallAdminActionsProps,
} from "@/components/crm-boilerplate/LiveQueueControls";
import type { RealtimePageRefreshProps } from "@/components/crm-boilerplate/RealtimePageRefresh";

function TelephonyPanelLoading() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="h-5 w-44 rounded bg-gray-100 dark:bg-white/[0.08]" />
      <div className="mt-4 space-y-3">
        <div className="h-10 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-10 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-10 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
      </div>
    </div>
  );
}

function QueueActionsLoading() {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="h-9 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.04]" />
      <div className="h-9 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.04]" />
    </div>
  );
}

export const AgentsManager = dynamic(
  () => import("@/components/crm-boilerplate/AgentsManager"),
  { loading: TelephonyPanelLoading, ssr: false },
);

export const BusinessNumbersManager = dynamic(
  () => import("@/components/crm-boilerplate/BusinessNumbersManager"),
  { loading: TelephonyPanelLoading, ssr: false },
);

export const BusinessHoursSettingsForm = dynamic(
  () =>
    import("@/components/crm-boilerplate/PhoneSystemConfigForms").then(
      (module) => module.BusinessHoursSettingsForm,
    ),
  { loading: TelephonyPanelLoading, ssr: false },
);

export const CallLogWorkspace = dynamic(
  () => import("@/components/crm-boilerplate/CallLogWorkspace"),
  { loading: TelephonyPanelLoading, ssr: false },
);

export const CallRecordingSettingsForm =
  dynamic<CallRecordingSettingsFormProps>(
    () => import("@/components/crm-boilerplate/CallRecordingSettingsForm"),
    { loading: TelephonyPanelLoading, ssr: false },
  );

export const CallRouteForm = dynamic(
  () => import("@/components/crm-boilerplate/CallRouteForm"),
  { loading: TelephonyPanelLoading, ssr: false },
);

export const CallRoutingFlowBuilder = dynamic(
  () => import("@/components/crm-boilerplate/CallRoutingFlowBuilder"),
  { loading: TelephonyPanelLoading, ssr: false },
);

export const QueueSettingsForm = dynamic(
  () =>
    import("@/components/crm-boilerplate/PhoneSystemConfigForms").then(
      (module) => module.QueueSettingsForm,
    ),
  { loading: TelephonyPanelLoading, ssr: false },
);

export const LiveQueueTimer = dynamic<LiveQueueTimerProps>(
  () =>
    import("@/components/crm-boilerplate/LiveQueueControls").then(
      (module) => module.LiveQueueTimer,
    ),
  {
    loading: () => (
      <span className="font-semibold text-gray-800 dark:text-white/90">
        0:00
      </span>
    ),
    ssr: false,
  },
);

export const QueueCallAdminActions = dynamic<QueueCallAdminActionsProps>(
  () =>
    import("@/components/crm-boilerplate/LiveQueueControls").then(
      (module) => module.QueueCallAdminActions,
    ),
  { loading: QueueActionsLoading, ssr: false },
);

export const TelephonyRealtimePageRefresh =
  dynamic<RealtimePageRefreshProps>(
    () => import("@/components/crm-boilerplate/RealtimePageRefresh"),
    { loading: () => null, ssr: false },
  );

export const RecordingsWorkspace = dynamic(
  () => import("@/components/crm-boilerplate/RecordingsWorkspace"),
  { loading: TelephonyPanelLoading, ssr: false },
);

export const TwilioSettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/TwilioSettingsForm"),
  { loading: TelephonyPanelLoading, ssr: false },
);
