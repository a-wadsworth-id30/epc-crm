import { AlertTriangle, CheckCircle2, Settings2 } from "lucide-react";
import Link from "next/link";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import type { InstallerSuitability } from "@/lib/sales/installer-suitability";

type InstallerRow = {
  id: string;
  name: string;
  suitability: InstallerSuitability;
};

const statusLabels = {
  attention: "Needs attention",
  not_configured: "Checks not configured",
  ready: "Evidence ready",
} as const;

export default function InstallerSuitabilityPanel({
  installers,
}: {
  installers: InstallerRow[];
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Installer suitability
        </h2>
        <LazyHelpTooltip content="Checks assigned Installer participants against their configured Person Type, visible profile requirements and required documents. This is evidence readiness, not a legal or competency guarantee." />
      </div>
      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
        Review evidence before allocating or confirming installation work.
      </p>

      {!installers.length ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300">
          No participant has the Installer role on this Sale.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {installers.map((installer) => {
            const tone = installer.suitability.status;
            return (
              <article
                key={installer.id}
                className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/contacts/${installer.id}`}
                    className="font-semibold text-gray-800 hover:text-brand-600 hover:underline dark:text-white/90 dark:hover:text-brand-300"
                  >
                    {installer.name || "Unnamed installer"}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      tone === "ready"
                        ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300"
                        : tone === "attention"
                          ? "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300"
                          : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                    }`}
                  >
                    {statusLabels[tone]}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                  {installer.suitability.checks.map((check) => {
                    const Icon =
                      check.status === "passed"
                        ? CheckCircle2
                        : check.status === "attention"
                          ? AlertTriangle
                          : Settings2;
                    return (
                      <div
                        key={check.label}
                        className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]"
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            aria-hidden="true"
                            className={`h-4 w-4 shrink-0 ${
                              check.status === "passed"
                                ? "text-success-600"
                                : check.status === "attention"
                                  ? "text-warning-600"
                                  : "text-gray-400"
                            }`}
                          />
                          <p className="text-xs font-semibold text-gray-800 dark:text-white/90">
                            {check.label}
                          </p>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                          {check.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
