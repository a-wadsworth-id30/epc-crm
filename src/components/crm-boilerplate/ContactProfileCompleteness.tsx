import type { ContactProfileCompleteness as ContactProfileCompletenessValue } from "@/lib/contacts/profile-completeness";

export default function ContactProfileCompleteness({
  value,
  variant = "full",
}: {
  value: ContactProfileCompletenessValue;
  variant?: "compact" | "full";
}) {
  if (!value.isConfigured) return null;

  if (variant === "compact") {
    return (
      <span
        className={`mt-1.5 inline-flex h-5 items-center rounded-full px-1.5 text-[11px] font-semibold ${value.isComplete ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"}`}
        title={
          value.isComplete
            ? "Profile requirements complete"
            : `Missing: ${value.missing.map((field) => field.label).join(", ")}`
        }
      >
        Profile {value.percentage}%
      </span>
    );
  }

  return (
    <section
      className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]"
      aria-label="Profile completeness"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Profile completeness
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {value.isComplete
              ? "All configured profile requirements are complete."
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
        aria-label="Profile completeness"
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
