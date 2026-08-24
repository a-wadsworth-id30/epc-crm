"use client";

import dynamic from "next/dynamic";
import type { PipedriveLeadNotesSyncButtonProps } from "@/components/crm-boilerplate/PipedriveLeadNotesSyncButton";
import type { SaleDeleteModalProps } from "@/components/crm-boilerplate/SaleDeleteModal";

function SalesPanelLoading() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="h-5 w-48 rounded bg-gray-100 dark:bg-white/[0.08]" />
      <div className="mt-4 space-y-3">
        <div className="h-10 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-10 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-10 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
      </div>
    </div>
  );
}

function SalesWorkspaceLoading() {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-4 dark:border-gray-800">
        <div className="h-5 w-52 rounded bg-gray-100 dark:bg-white/[0.08]" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SalesPanelLoading />
        <SalesPanelLoading />
      </div>
    </section>
  );
}

export const SaleAutomationActivity = dynamic(
  () => import("@/components/crm-boilerplate/SaleAutomationActivity"),
  { loading: SalesPanelLoading, ssr: false },
);

export const SaleCallButton = dynamic(
  () => import("@/components/crm-boilerplate/SaleCallButton"),
  { loading: () => null, ssr: false },
);

export const PipedriveLeadNotesSyncButton =
  dynamic<PipedriveLeadNotesSyncButtonProps>(
    () => import("@/components/crm-boilerplate/PipedriveLeadNotesSyncButton"),
    { loading: () => null, ssr: false },
  );

export const SaleDetailAIWorkspace = dynamic(
  () => import("@/components/crm-boilerplate/SaleDetailAIWorkspace"),
  { loading: SalesWorkspaceLoading, ssr: false },
);

export const SaleDeleteModal = dynamic<SaleDeleteModalProps>(
  () => import("@/components/crm-boilerplate/SaleDeleteModal"),
  { loading: () => null, ssr: false },
);

export const SaleDiscoveryPanel = dynamic(
  () => import("@/components/crm-boilerplate/SaleDiscoveryPanel"),
  { loading: SalesPanelLoading, ssr: false },
);

export const SaleStageControl = dynamic(
  () => import("@/components/crm-boilerplate/SaleStageControl"),
  { loading: SalesPanelLoading, ssr: false },
);
