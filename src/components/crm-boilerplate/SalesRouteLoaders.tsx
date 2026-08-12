"use client";

import dynamic from "next/dynamic";
import DeferredActionLoader from "@/components/crm-boilerplate/DeferredActionLoader";
import PlusIcon from "@/icons/plus.svg";
import type { AddSaleModalProps } from "@/components/crm-boilerplate/AddSaleModal";
import type { SalesPipelineFiltersProps } from "@/components/crm-boilerplate/SalesPipelineFilters";
import type { SalesTableFrameProps } from "@/components/crm-boilerplate/SalesTableFrame";

const LoadedAddSaleModal = dynamic<AddSaleModalProps>(
  () => import("@/components/crm-boilerplate/AddSaleModal"),
  {
    ssr: false,
    loading: () => (
      <AddSaleTrigger
        disabled
        label="Loading..."
        onOpen={() => undefined}
      />
    ),
  },
);

const LoadedSalesPipelineFilters = dynamic<SalesPipelineFiltersProps>(
  () => import("@/components/crm-boilerplate/SalesPipelineFilters"),
  {
    ssr: false,
    loading: SalesPipelineFiltersLoading,
  },
);

const LoadedSalesTableFrame = dynamic<SalesTableFrameProps>(
  () => import("@/components/crm-boilerplate/SalesTableFrame"),
  {
    ssr: false,
    loading: SalesTableFrameLoading,
  },
);

function SalesPipelineFiltersLoading() {
  return (
    <aside className="border-b border-gray-100 bg-gray-50/50 p-3 xl:border-r xl:border-b-0 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="h-4 w-28 rounded bg-gray-100 dark:bg-white/[0.08]" />
            <div className="mt-2 h-3 w-36 rounded bg-gray-50 dark:bg-white/[0.05]" />
          </div>
          <div className="h-5 w-14 rounded-full bg-gray-100 dark:bg-white/[0.08]" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 xl:block xl:space-y-1.5">
          {["lead", "qualified", "proposal", "negotiation", "won", "lost"].map(
            (item) => (
              <div
                key={item}
                className="h-8 rounded-lg border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.04]"
              />
            ),
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:block xl:space-y-3">
          {["search", "stage", "owner", "sort"].map((item) => (
            <div key={item}>
              <div className="h-3 w-12 rounded bg-gray-100 dark:bg-white/[0.08]" />
              <div className="mt-2 h-9 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SalesTableFrameLoading() {
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[1180px] divide-y divide-gray-100 dark:divide-gray-800">
          <div className="grid grid-cols-[40px_250px_170px_135px_110px_250px_145px_100px_100px] gap-3 bg-gray-50/80 px-3 py-2 dark:bg-white/[0.02]">
            {[
              "select",
              "lead",
              "sources",
              "attribution",
              "stage",
              "next",
              "owner",
              "contact",
              "value",
            ].map((item) => (
              <div
                key={item}
                className="h-3 rounded bg-gray-100 dark:bg-white/[0.08]"
              />
            ))}
          </div>
          {["one", "two", "three", "four"].map((item) => (
            <div
              key={item}
              className="grid grid-cols-[40px_250px_170px_135px_110px_250px_145px_100px_100px] gap-3 px-3 py-3"
            >
              <div className="h-4 w-4 rounded border border-gray-200 dark:border-gray-800" />
              <div>
                <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-3 w-32 rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="h-7 w-32 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-6 w-24 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              <div>
                <div className="h-4 w-44 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-3 w-16 rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="h-6 w-24 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-16 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="ml-auto h-4 w-20 rounded bg-gray-100 dark:bg-white/[0.08]" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-2 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-3 w-32 rounded bg-gray-50 dark:bg-white/[0.05]" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
          <div className="h-3 w-10 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="h-8 w-16 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        </div>
      </div>
    </div>
  );
}

export function DeferredAddSaleModal(props: AddSaleModalProps) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <AddSaleTrigger label={props.triggerLabel ?? "Add sale"} onOpen={open} />
      )}
    >
      {(autoOpen) => <LoadedAddSaleModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

export function LazySalesPipelineFilters(props: SalesPipelineFiltersProps) {
  return <LoadedSalesPipelineFilters {...props} />;
}

export function LazySalesTableFrame(props: SalesTableFrameProps) {
  return <LoadedSalesTableFrame {...props} />;
}

function AddSaleTrigger({
  disabled = false,
  label,
  onOpen,
}: {
  disabled?: boolean;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 disabled:opacity-50"
    >
      <PlusIcon className="size-4" />
      {label}
    </button>
  );
}
