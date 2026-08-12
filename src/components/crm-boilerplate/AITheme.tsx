import { SparkIcon } from "@/icons";

export function AISparkIcon({
  className = "text-purple-600 dark:text-purple-300",
  wrapperClassName = "size-4",
}: {
  className?: string;
  wrapperClassName?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center overflow-visible leading-none [&>svg]:m-0 [&>svg]:block [&>svg]:shrink-0 ${wrapperClassName}`}
    >
      <SparkIcon
        className={`h-full w-full ${className}`}
      />
    </span>
  );
}

export function AILabel({ label = "AI assistant" }: { label?: string }) {
  return (
    <span className="inline-flex rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-lime-400 p-[1.5px]">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 dark:bg-gray-950 dark:text-white/90">
        <AISparkIcon wrapperClassName="size-3.5" />
        {label}
      </span>
    </span>
  );
}

export function AIActionButton({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`ai-gradient-button inline-flex rounded-lg p-[2px] shadow-sm shadow-cyan-100 dark:shadow-none ${className}`}
    >
      <span className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-[6px] bg-white px-3 text-sm font-semibold text-gray-900 dark:bg-gray-950 dark:text-white">
        <AISparkIcon />
        {children}
      </span>
    </span>
  );
}

export function AIInsightCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50/70 p-3 dark:border-purple-900/40 dark:bg-purple-500/10">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-purple-700 dark:text-purple-300">
          {title}
        </p>
        <AISparkIcon />
      </div>
      <div className="mt-2 text-sm leading-5 text-gray-700 dark:text-gray-300">
        {children}
      </div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
