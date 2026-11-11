"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  repairSaleRelationshipAction,
  type SaleRelationshipRepairState,
} from "@/lib/actions/sale-relationship-integrity";
import type {
  SaleRelationshipFinding,
  SaleRelationshipRepair,
} from "@/lib/sales/relationship-integrity";

const initialState: SaleRelationshipRepairState = { message: "", ok: false };

function RelationshipRepairButton({
  repair,
  saleId,
}: {
  repair: SaleRelationshipRepair;
  saleId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [state, action, isPending] = useActionState(
    repairSaleRelationshipAction,
    initialState,
  );

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message, state.ok ? "success" : "error");
    if (state.ok) router.refresh();
  }, [router, showToast, state]);

  return (
    <form action={action}>
      <input type="hidden" name="repair" value={repair.kind} />
      <input type="hidden" name="saleId" value={saleId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-warning-300 bg-white px-3 py-1.5 text-xs font-semibold text-warning-800 transition hover:bg-warning-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-warning-800 dark:bg-gray-900 dark:text-warning-300 dark:hover:bg-warning-900/20"
      >
        {isPending ? "Repairing..." : repair.label}
      </button>
      <ActionStateMessage state={state.message ? state : undefined} />
    </form>
  );
}

export default function SaleRelationshipIntegrityPanel({
  findings,
  saleId,
}: {
  findings: SaleRelationshipFinding[];
  saleId: string;
}) {
  if (!findings.length) {
    return (
      <section className="rounded-2xl border border-success-200 bg-success-50/60 p-4 shadow-theme-xs dark:border-success-900/50 dark:bg-success-900/10">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-600 dark:text-success-400" />
          <div>
            <h2 className="text-sm font-semibold text-success-800 dark:text-success-200">
              Relationships are consistent
            </h2>
            <p className="mt-1 text-xs leading-5 text-success-700 dark:text-success-300">
              The primary Person, participant and Company links agree.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-warning-200 bg-warning-50/40 p-4 shadow-theme-xs dark:border-warning-900/50 dark:bg-warning-900/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning-600 dark:text-warning-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Relationship review
          </h2>
        </div>
        <span className="rounded-full bg-warning-100 px-2 py-0.5 text-xs font-semibold text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
          {findings.length}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {findings.map((finding) => (
          <div
            key={finding.code}
            className="rounded-xl border border-warning-100 bg-white p-3 dark:border-warning-900/40 dark:bg-gray-900"
          >
            <div className="flex items-start gap-2">
              {finding.severity === "review" ? (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
              )}
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {finding.title}
                </h3>
                <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                  {finding.detail}
                </p>
              </div>
            </div>
            {finding.repairs.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {finding.repairs.map((repair) => (
                  <RelationshipRepairButton
                    key={repair.kind}
                    repair={repair}
                    saleId={saleId}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
