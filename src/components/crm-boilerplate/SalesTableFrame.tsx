"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ChangeEvent,
  type ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import TrashBinIcon from "@/icons/trash.svg";
import { bulkUpdateSalesAction } from "@/lib/actions/sales";

type Option = {
  label: string;
  value: string;
};

export type SalesTableFrameProps = {
  canDeleteSales: boolean;
  children: ReactNode;
  ownerOptions: Option[];
  page: number;
  pageSize: number;
  stageOptions: Option[];
  totalCount: number;
};

export default function SalesTableFrame({
  canDeleteSales,
  children,
  ownerOptions,
  page,
  pageSize,
  stageOptions,
  totalCount,
}: SalesTableFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const frameRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [activeBulkAction, setActiveBulkAction] = useState<
    "delete" | "owner" | "stage" | null
  >(null);
  const [stageState, stageAction, isStagePending] = useActionState(
    bulkUpdateSalesAction,
    { ok: false, message: "" },
  );
  const [ownerState, ownerAction, isOwnerPending] = useActionState(
    bulkUpdateSalesAction,
    { ok: false, message: "" },
  );
  const [deleteState, deleteAction, isDeletePending] = useActionState(
    bulkUpdateSalesAction,
    { ok: false, message: "" },
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(totalCount, currentPage * pageSize);
  const selectedValue = selectedIds.join(",");

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });

      const nextUrl = params.toString() ? `${pathname}?${params}` : pathname;
      router.push(nextUrl);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const checkboxes = Array.from(
      frameRef.current?.querySelectorAll<HTMLInputElement>(
        "input[data-sales-row-checkbox]",
      ) ?? [],
    );

    checkboxes.forEach((checkbox) => {
      checkbox.checked = selectedIds.includes(checkbox.value);
    });

    const selectAll = frameRef.current?.querySelector<HTMLInputElement>(
      "input[data-sales-select-all]",
    );
    if (selectAll) {
      selectAll.checked =
        checkboxes.length > 0 &&
        checkboxes.every((checkbox) => selectedIds.includes(checkbox.value));
      selectAll.indeterminate =
        checkboxes.some((checkbox) => selectedIds.includes(checkbox.value)) &&
        !selectAll.checked;
    }
  }, [selectedIds]);

  useEffect(() => {
    const latestState = stageState.ok
      ? stageState
      : ownerState.ok
        ? ownerState
        : deleteState.ok
          ? deleteState
          : null;
    if (!latestState) return;

    router.refresh();
  }, [deleteState, ownerState, router, stageState]);

  const onSelectionChange = (event: ChangeEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    setDeleteArmed(false);

    if (target.dataset.salesSelectAll !== undefined) {
      const pageIds = Array.from(
        frameRef.current?.querySelectorAll<HTMLInputElement>(
          "input[data-sales-row-checkbox]",
        ) ?? [],
      ).map((checkbox) => checkbox.value);

      setSelectedIds((current) =>
        target.checked
          ? Array.from(new Set([...current, ...pageIds]))
          : current.filter((id) => !pageIds.includes(id)),
      );
      return;
    }

    if (target.dataset.salesRowCheckbox !== undefined) {
      setSelectedIds((current) =>
        target.checked
          ? Array.from(new Set([...current, target.value]))
          : current.filter((id) => id !== target.value),
      );
    }
  };

  const canBulkUpdate =
    selectedIds.length > 0 &&
    !isStagePending &&
    !isOwnerPending &&
    !isDeletePending;
  const activeState =
    activeBulkAction === "stage"
      ? stageState
      : activeBulkAction === "owner"
        ? ownerState
        : activeBulkAction === "delete"
          ? deleteState
          : null;
  const compactSelectClassName =
    "h-8 min-w-28 rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300";
  const compactButtonClassName =
    "inline-flex h-8 items-center justify-center rounded-md border border-gray-300 px-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]";
  const dangerButtonClassName =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-error-300 px-2 text-xs font-semibold text-error-700 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-error-800 dark:text-error-300 dark:hover:bg-error-500/10";

  return (
    <div ref={frameRef} onChange={onSelectionChange}>
      {selectedIds.length > 0 ? (
        <div className="flex flex-col gap-2 border-b border-gray-100 bg-white px-3 py-1.5 dark:border-gray-800 dark:bg-white/[0.01] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
              {selectedIds.length} selected
            </span>
          </div>

          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <form
              action={stageAction}
              className="flex items-center gap-2"
              onSubmit={() => setActiveBulkAction("stage")}
            >
              <input type="hidden" name="ids" value={selectedValue} />
              <input type="hidden" name="bulkAction" value="stage" />
              <select name="salesPipelineStageId" className={compactSelectClassName}>
                {stageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!canBulkUpdate}
                className={compactButtonClassName}
              >
                Apply stage
              </button>
            </form>

            <form
              action={ownerAction}
              className="flex items-center gap-2"
              onSubmit={() => setActiveBulkAction("owner")}
            >
              <input type="hidden" name="ids" value={selectedValue} />
              <input type="hidden" name="bulkAction" value="owner" />
              <select name="ownerId" className={compactSelectClassName}>
                <option value="unassigned">Unassigned</option>
                {ownerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!canBulkUpdate}
                className={compactButtonClassName}
              >
                Assign
              </button>
            </form>

            {canDeleteSales ? (
              <div className="flex flex-col gap-1">
                <form
                  action={deleteAction}
                  className="flex items-center gap-2"
                  onSubmit={() => {
                    setActiveBulkAction("delete");
                    setDeleteArmed(false);
                    setSelectedIds([]);
                  }}
                >
                  <input type="hidden" name="ids" value={selectedValue} />
                  <input type="hidden" name="bulkAction" value="delete-crm" />
                  <input type="hidden" name="confirmDelete" value="crm-only" />
                  {deleteArmed ? (
                    <>
                      <button
                        type="submit"
                        disabled={!canBulkUpdate}
                        className={dangerButtonClassName}
                      >
                        <TrashBinIcon className="size-3.5" />
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        disabled={isDeletePending}
                        className={compactButtonClassName}
                        onClick={() => setDeleteArmed(false)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!canBulkUpdate}
                      className={dangerButtonClassName}
                      onClick={() => {
                        setActiveBulkAction("delete");
                        setDeleteArmed(true);
                      }}
                    >
                      <TrashBinIcon className="size-3.5" />
                      Delete from CRM
                    </button>
                  )}
                </form>
                {deleteArmed ? (
                  <p className="max-w-72 text-[11px] leading-4 text-error-600 dark:text-error-300">
                    CRM only. Pipedrive is not changed.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeState?.message ? (
        <div className="border-b border-gray-100 px-4 py-2 dark:border-gray-800">
          <ActionStateMessage state={activeState} />
        </div>
      ) : null}

      {children}

      <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-2 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Showing {totalCount ? pageStart + 1 : 0}-{pageEnd} of {totalCount}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              updateParams({
                page: currentPage > 2 ? String(currentPage - 1) : null,
              })
            }
            disabled={currentPage === 1}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Previous
          </button>
          <span className="min-w-14 text-center text-xs font-medium text-gray-600 dark:text-gray-300">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => updateParams({ page: String(currentPage + 1) })}
            disabled={currentPage === totalPages}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
