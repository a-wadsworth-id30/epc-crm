import Link from "next/link";
import { AlertCircle, ArrowRight, X } from "lucide-react";
import { dismissDashboardSetupPromptAction } from "@/lib/actions/setup";
import type { DashboardSetupPrompt as DashboardSetupPromptData } from "@/lib/setup/readiness";

export default function DashboardSetupPrompt({
  prompt,
}: {
  prompt: DashboardSetupPromptData;
}) {
  const primaryIssue = prompt.outstandingItems[0];
  const remainingCount = Math.max(0, prompt.outstandingItems.length - 3);
  const progress = Math.max(0, Math.min(100, prompt.completionPercent));

  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-warning-200 bg-warning-50 shadow-theme-xs dark:border-warning-900/40 dark:bg-warning-900/10">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300">
            <AlertCircle className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white/90">
                Complete workspace setup
              </h2>
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-warning-700 ring-1 ring-warning-200 dark:bg-white/[0.06] dark:text-warning-300 dark:ring-warning-900/40">
                {prompt.completionPercent}% complete
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-700 dark:text-gray-300">
              {prompt.neededCount > 0
                ? `${prompt.neededCount} setup item${
                    prompt.neededCount === 1 ? "" : "s"
                  } still need attention before this workspace is ready for handover.`
                : `${prompt.warningCount} recommended setup item${
                    prompt.warningCount === 1 ? "" : "s"
                  } should be reviewed before handover.`}
            </p>
            <div className="mt-4 h-2 max-w-xl rounded-full bg-white/80 dark:bg-white/[0.08]">
              <div
                className="h-2 rounded-full bg-warning-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {prompt.outstandingItems.slice(0, 3).map((item) => (
                <Link
                  key={`${item.title}-${item.href}`}
                  href={item.href}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 transition hover:text-brand-600 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/10 dark:hover:text-brand-300"
                >
                  {item.title}
                  <ArrowRight className="size-3" />
                </Link>
              ))}
              {remainingCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-white/10">
                  +{remainingCount} more
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          <Link
            href={primaryIssue?.href ?? "/settings/setup"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
          >
            Continue setup
            <ArrowRight className="size-4" />
          </Link>
          <form action={dismissDashboardSetupPromptAction}>
            <button
              type="submit"
              aria-label="Dismiss setup prompt"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-warning-200 bg-white text-gray-500 transition hover:bg-warning-100 hover:text-gray-700 dark:border-warning-900/40 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]"
            >
              <X className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
