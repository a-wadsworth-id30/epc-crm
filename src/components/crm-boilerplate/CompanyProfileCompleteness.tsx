import type { CompanyProfileCompleteness as CompanyProfileCompletenessValue } from "@/lib/companies/profile-completeness";

export default function CompanyProfileCompleteness({
  value,
}: {
  value: CompanyProfileCompletenessValue;
}) {
  if (!value.isConfigured) return null;

  return (
    <section
      className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]"
      aria-label="Company profile completeness"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Profile completeness
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {value.isComplete
              ? "All configured company requirements are complete."
              : `${value.completed} of ${value.total} configured requirements completed.`}
          </p>
        </div>
        <span
          className={`text-sm font-semibold ${value.isComplete ? "text-success-600 dark:text-success-400" : "text-warning-600 dark:text-warning-400"}`}
        >
          {value.percentage}%
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        role="progressbar"
        aria-label="Company profile completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value.percentage}
      >
        <div
          className={`h-full rounded-full transition-[width] ${value.isComplete ? "bg-success-500" : "bg-warning-500"}`}
          style={{ width: `${value.percentage}%` }}
        />
      </div>
      {value.missing.length ? (
        <p className="mt-3 text-xs leading-5 text-gray-600 dark:text-gray-300">
          <span className="font-semibold">Missing:</span>{" "}
          {value.missing.map((field) => field.label).join(", ")}
        </p>
      ) : null}
    </section>
  );
}
