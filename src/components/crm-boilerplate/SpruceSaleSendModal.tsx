"use client";

import { ExternalLink, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { sendSaleToSpruceAction } from "@/lib/actions/sales";
import { spruceJobFieldOptions } from "@/lib/integrations/spruce-job-fields";

export type SpruceSaleSendModalProps = {
  customerName: string;
  directApiConfigured: boolean;
  hasOutboundRequest: boolean;
  linkedExternalJobId: string | null;
  linkedExternalJobUrl: string | null;
  projectAddress: string;
  saleId: string;
  saleTitle: string;
};

const initialState = { ok: false, message: "" };

export default function SpruceSaleSendModal({
  customerName,
  directApiConfigured,
  hasOutboundRequest,
  linkedExternalJobId,
  linkedExternalJobUrl,
  projectAddress,
  saleId,
  saleTitle,
}: SpruceSaleSendModalProps) {
  const modal = useModal();
  const { closeModal, isOpen, openModal } = modal;
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    sendSaleToSpruceAction,
    initialState,
  );
  const alreadySent = Boolean(linkedExternalJobId || hasOutboundRequest);

  useEffect(() => {
    if (!state.ok) return;

    closeModal();
    router.refresh();
  }, [closeModal, router, state.ok]);

  return (
    <>
      <button
        type="button"
        disabled={alreadySent}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300 dark:hover:bg-brand-900/30"
        onClick={openModal}
      >
        <Send className="size-4" />
        {linkedExternalJobId
          ? "Linked to Spruce"
          : hasOutboundRequest
            ? "Sent to Spruce"
            : "Send to Spruce"}
      </button>
      {alreadySent && linkedExternalJobUrl ? (
        <a
          href={linkedExternalJobUrl}
          target="_blank"
          rel="noreferrer"
          title={
            linkedExternalJobId
              ? `Open Spruce job ${linkedExternalJobId}`
              : "Open Spruce entry"
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300 dark:hover:bg-brand-900/30"
        >
          <ExternalLink className="size-4" />
          Open Spruce
        </a>
      ) : null}

      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        className="relative m-5 max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
            <Send className="size-5" />
          </div>
          <h2 className="mb-2 text-title-xs font-semibold text-gray-800 dark:text-white/90">
            Send sale to Spruce
          </h2>
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
            {directApiConfigured
              ? "Create a Spruce job through the configured Spruce API. This is a manual write to Spruce and will be logged in sync history."
              : "Add a Spruce API key in Settings > Integrations > Spruce before sending sales."}
          </p>

          <form action={formAction} className="mt-5 space-y-5">
            <input type="hidden" name="saleId" value={saleId} />

            <dl className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-white/[0.03]">
              <PreviewRow label="Sale" value={saleTitle} />
              <PreviewRow
                label="Customer"
                value={customerName || "Not captured"}
              />
              <PreviewRow
                label="Address"
                value={projectAddress || "Not captured"}
              />
            </dl>

            {directApiConfigured ? (
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <p className="mb-4 text-sm font-medium text-gray-800 dark:text-white/90">
                  Spruce job details
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SpruceSelectField
                    label="Property type"
                    name="propertyType"
                    options={spruceJobFieldOptions.propertyType}
                    required
                  />
                  <SpruceSelectField
                    label="Built form"
                    name="builtForm"
                    options={spruceJobFieldOptions.builtForm}
                    required
                  />
                  <SpruceNumberField
                    label="Floor area m2"
                    min="1"
                    name="floorAreaM2"
                    required
                    step="0.1"
                  />
                  <SpruceNumberField
                    label="Bedrooms"
                    min="0"
                    name="numBedrooms"
                    required
                    step="1"
                  />
                  <SpruceSelectField
                    label="Fuel type"
                    name="fuelType"
                    options={spruceJobFieldOptions.fuelType}
                    required
                  />
                  <SpruceSelectField
                    label="Loft insulation"
                    name="loftInsulation"
                    options={spruceJobFieldOptions.loftInsulation}
                    required
                  />
                  <SpruceSelectField
                    label="Wall type"
                    name="wallType"
                    options={spruceJobFieldOptions.wallType}
                    required
                  />
                  <SpruceSelectField
                    label="Window type"
                    name="windowType"
                    options={spruceJobFieldOptions.windowType}
                    required
                  />
                  <SpruceNumberField
                    label="Latitude"
                    max="90"
                    min="-90"
                    name="latitude"
                    step="0.000001"
                  />
                  <SpruceNumberField
                    label="Longitude"
                    max="180"
                    min="-180"
                    name="longitude"
                    step="0.000001"
                  />
                </div>
              </div>
            ) : null}

            {state.message && !state.ok ? (
              <ActionStateMessage state={state} />
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !directApiConfigured}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" />
                {isPending
                  ? "Sending..."
                  : directApiConfigured
                    ? "Send to Spruce"
                    : "API key missing"}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}

function SpruceSelectField({
  label,
  name,
  options,
  required = false,
}: {
  label: string;
  name: string;
  options: readonly { label: string; value: string }[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
      >
        <option value="" disabled>
          Select
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SpruceNumberField({
  label,
  max,
  min,
  name,
  required = false,
  step,
}: {
  label: string;
  max?: string;
  min?: string;
  name: string;
  required?: boolean;
  step: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        required={required}
        step={step}
        className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
      />
    </label>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)]">
      <dt className="font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 break-words text-gray-800 dark:text-white/90">
        {value}
      </dd>
    </div>
  );
}
