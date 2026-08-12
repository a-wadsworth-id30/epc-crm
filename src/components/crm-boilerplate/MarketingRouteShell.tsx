import Link from "next/link";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import {
  marketingRanges,
  marketingSectionHref,
  marketingSections,
  marketingViewHref,
  type MarketingRange,
  type MarketingSection,
  type MarketingView,
} from "@/lib/marketing/report-navigation";

export function MarketingSectionTabs({
  activeRange,
  activeSection,
}: {
  activeRange: MarketingRange;
  activeSection: MarketingSection;
}) {
  return (
    <nav
      aria-label="Marketing sections"
      className="max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-xs sm:overflow-x-auto sm:overscroll-x-contain dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:w-max sm:min-w-max">
        {marketingSections.map((section) => {
          const isActive = activeSection === section.value;

          return (
            <Link
              key={section.value}
              href={marketingSectionHref(section.value, activeRange)}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-10 min-w-0 items-center justify-center rounded-lg px-3 text-center text-sm font-semibold transition sm:px-4 ${
                isActive
                  ? "bg-brand-500 text-white shadow-theme-xs"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              }`}
              title={section.description}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function MarketingRouteShell({
  activeRange,
  activeView,
}: {
  activeRange: MarketingRange;
  activeView: MarketingView;
}) {
  return (
    <>
      <MarketingSectionTabs
        activeRange={activeRange}
        activeSection={activeView}
      />

      <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Date range
            </h2>
            <LazyHelpTooltip content="Filters Marketing metrics, source tables, ad spend rows and conversion evidence to the selected reporting period." />
          </div>
          <div className="max-w-full min-w-0 rounded-xl bg-gray-50 p-1 sm:overflow-x-auto sm:overscroll-x-contain dark:bg-white/[0.03]">
            <div className="grid min-w-0 grid-cols-2 gap-1 sm:flex sm:w-max sm:min-w-max">
              {marketingRanges.map((range) => {
                const isActive = activeRange === range.value;

                return (
                  <Link
                    key={range.value}
                    href={marketingViewHref(activeView, range.value)}
                    className={`inline-flex min-h-9 min-w-0 items-center justify-center rounded-lg px-3 text-center text-sm font-semibold transition ${
                      isActive
                        ? "bg-white text-brand-600 shadow-theme-xs dark:bg-gray-900 dark:text-brand-300"
                        : "text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    {range.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
