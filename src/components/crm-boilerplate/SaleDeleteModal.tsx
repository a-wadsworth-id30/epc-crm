"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { Modal } from "@/components/ui/modal";
import TrashBinIcon from "@/icons/trash.svg";
import { useModal } from "@/hooks/useModal";
import { bulkUpdateSalesAction } from "@/lib/actions/sales";

export type SaleDeleteModalProps = {
  saleId: string;
  saleTitle: string;
};

export default function SaleDeleteModal({
  saleId,
  saleTitle,
}: SaleDeleteModalProps) {
  const modal = useModal();
  const router = useRouter();
  const [state, action, isPending] = useActionState(bulkUpdateSalesAction, {
    ok: false,
    message: "",
  });

  useEffect(() => {
    if (!state.ok) return;

    router.replace("/sales");
    router.refresh();
  }, [router, state.ok]);

  return (
    <>
      <button
        type="button"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-error-300 bg-white px-3 text-sm font-semibold text-error-600 transition hover:bg-error-50 dark:border-error-800 dark:bg-gray-900 dark:hover:bg-error-900/20"
        onClick={modal.openModal}
      >
        <TrashBinIcon className="size-4" />
        Delete from CRM
      </button>

      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[500px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-300">
            <TrashBinIcon className="size-5" />
          </div>
          <h2 className="mb-2 text-title-xs font-semibold text-gray-800 dark:text-white/90">
            Delete sale
          </h2>
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
            Remove {saleTitle} from the CRM? This cannot be undone. Pipedrive
            will not be changed.
          </p>
          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
            CRM deletion will be blocked if this sale still has linked
            documents, customer links, signature requests, marketing uploads or
            open tasks.
          </p>

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
              onClick={modal.closeModal}
            >
              Cancel
            </button>
            <form action={action}>
              <input type="hidden" name="ids" value={saleId} />
              <input type="hidden" name="bulkAction" value="delete-crm" />
              <input type="hidden" name="confirmDelete" value="crm-only" />
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-error-500 px-5 text-sm font-medium text-white transition hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <TrashBinIcon className="size-4" />
                {isPending ? "Deleting..." : "Delete from CRM"}
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </>
  );
}
