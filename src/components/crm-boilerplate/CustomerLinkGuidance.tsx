import { CheckCircle2, ShieldCheck } from "lucide-react";

export function CustomerLinkGuidance({
  note,
  steps,
  summary,
  title = "How to use this link",
}: {
  note: string;
  steps: string[];
  summary: string;
  title?: string;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {summary}
          </p>
        </div>
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm text-gray-700 dark:text-gray-300">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600 ring-1 ring-success-100 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40">
              {index + 1}
            </span>
            <span className="leading-6">{step}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 flex gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-400">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
        <span>{note}</span>
      </p>
    </section>
  );
}
