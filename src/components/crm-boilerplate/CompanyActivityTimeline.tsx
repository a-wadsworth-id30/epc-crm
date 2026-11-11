import Link from "next/link";
import { ClipboardList, Mail, MessageSquareText } from "lucide-react";

export type CompanyActivityItem = {
  actor: string;
  date: string;
  detail: string | null;
  href: string | null;
  id: string;
  kind: "Communication" | "Note" | "Task";
  status: string | null;
  summary: string;
  title: string;
};

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const kindStyles = {
  Communication:
    "bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40",
  Note: "bg-warning-50 text-warning-700 ring-warning-100 dark:bg-warning-500/10 dark:text-warning-300 dark:ring-warning-900/40",
  Task: "bg-success-50 text-success-700 ring-success-100 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-900/40",
} as const;

const kindIcons = {
  Communication: Mail,
  Note: MessageSquareText,
  Task: ClipboardList,
} as const;

export default function CompanyActivityTimeline({
  items,
}: {
  items: CompanyActivityItem[];
}) {
  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Company activity
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Recent authorised communications, notes and tasks across this
            company, its people and linked sales.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          {items.length} recent
        </span>
      </div>

      {items.length ? (
        <ol className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">
          {items.map((item) => {
            const Icon = kindIcons[item.kind];
            const content = (
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${kindStyles[item.kind]}`}
                  >
                    {item.kind}
                  </span>
                  {item.status ? (
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {item.status}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  {item.title}
                </h3>
                <p className="mt-1 line-clamp-3 text-sm leading-6 whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                  {item.summary}
                </p>
                {item.detail ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {item.detail}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {item.actor} | {formatActivityDate(item.date)}
                </p>
              </div>
            );

            return (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex gap-3 py-4 first:pt-0 last:pb-0"
              >
                <span className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="min-w-0 flex-1 rounded-lg transition outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/[0.03]"
                  >
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          No activity is available for this company yet.
        </div>
      )}
    </div>
  );
}
