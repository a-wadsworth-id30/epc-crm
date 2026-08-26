"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { sendSaleToSpruceAction } from "@/lib/actions/sales";

export type SpruceSaleSendModalProps = {
  customerName: string;
  hasOutboundRequest: boolean;
  linkedExternalJobId: string | null;
  projectAddress: string;
  saleId: string;
  saleTitle: string;
};

const initialState = { ok: false, message: "" };

export default function SpruceSaleSendModal({
  customerName,
  hasOutboundRequest,
  linkedExternalJobId,
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

      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        className="relative m-5 w-full max-w-[540px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
            <Send className="size-5" />
          </div>
          <h2 className="mb-2 text-title-xs font-semibold text-gray-800 dark:text-white/90">
            Send sale to Spruce
          </h2>
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
            Send this CRM sale to the configured Spruce/Zapier outbound
            webhook. This is a manual write to Zapier/Spruce and will be logged
            in sync history.
          </p>

          <dl className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-white/[0.03]">
            <PreviewRow label="Sale" value={saleTitle} />
            <PreviewRow label="Customer" value={customerName || "Not captured"} />
            <PreviewRow
              label="Address"
              value={projectAddress || "Not captured"}
            />
          </dl>

          {state.message && !state.ok ? (
            <div className="mt-4">
              <ActionStateMessage state={state} />
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={isPending}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              onClick={closeModal}
            >
              Cancel
            </button>
            <form action={formAction}>
              <input type="hidden" name="saleId" value={saleId} />
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" />
                {isPending ? "Sending..." : "Send to Spruce"}
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </>
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
