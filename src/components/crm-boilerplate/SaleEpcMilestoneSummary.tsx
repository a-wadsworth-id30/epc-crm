import { CheckCircle2, CircleDashed } from "lucide-react";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import type { EpcMilestone } from "@/lib/sales/epc-milestones";

export default function SaleEpcMilestoneSummary({
  milestones,
}: {
  milestones: EpcMilestone[];
}) {
  const evidenced = milestones.filter(
    (milestone) => milestone.status === "evidenced",
  ).length;

  return (
    <section className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              EPC delivery milestones
            </h2>
            <LazyHelpTooltip content="Evidence-based summary from linked documents, completed tasks, communications and Sale scope. It does not replace the pipeline stage or confirm contractual completion." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            A quick operational view of evidence already held against this Sale.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
          {evidenced} of {milestones.length} evidenced
        </span>
      </div>

      <ol className="mt-4 grid gap-2 md:grid-cols-5">
        {milestones.map((milestone, index) => {
          const isEvidenced = milestone.status === "evidenced";
          const Icon = isEvidenced ? CheckCircle2 : CircleDashed;

          return (
            <li
              key={milestone.action}
              className={`rounded-xl border px-3 py-3 ${
                isEvidenced
                  ? "border-success-200 bg-success-50/70 dark:border-success-500/20 dark:bg-success-500/10"
                  : "border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-white/[0.02]"
              }`}
            >
              <div className="flex items-start gap-2">
                <Icon
                  aria-hidden="true"
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    isEvidenced
                      ? "text-success-600 dark:text-success-400"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-400 uppercase dark:text-gray-500">
                    Step {index + 1}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-white/90">
                    {milestone.label}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                {milestone.description}
              </p>
              <p
                className={`mt-2 text-xs font-semibold ${
                  isEvidenced
                    ? "text-success-700 dark:text-success-300"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {isEvidenced ? "Evidence found" : "No evidence found yet"}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
