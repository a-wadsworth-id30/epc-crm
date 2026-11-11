import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ClipboardList,
  UserRound,
  type LucideIcon,
} from "lucide-react";

type ConnectedRecord = {
  detail?: string | null;
  href?: string | null;
  label: string;
  meta?: string | null;
  name: string;
};

type ConnectedRecordContextProps = {
  company?: ConnectedRecord | null;
  currentRecord: "company" | "person" | "sale";
  nextAction?: string | null;
  person?: ConnectedRecord | null;
  sale?: ConnectedRecord | null;
};

const recordTypes: Array<{
  Icon: LucideIcon;
  key: ConnectedRecordContextProps["currentRecord"];
}> = [
  { Icon: Building2, key: "company" },
  { Icon: UserRound, key: "person" },
  { Icon: ClipboardList, key: "sale" },
];

function ConnectedRecordCard({
  Icon,
  current,
  record,
}: {
  Icon: LucideIcon;
  current: boolean;
  record: ConnectedRecord | null | undefined;
}) {
  const content = (
    <>
      <span
        className={`inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${
          current
            ? "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40"
            : "bg-gray-50 text-gray-500 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800"
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            {record?.label ?? "Not linked"}
          </span>
          {current ? (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              Current
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-gray-900 dark:text-white">
          {record?.name ?? "No record linked"}
        </span>
        {record?.meta || record?.detail ? (
          <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
            {[record.meta, record.detail].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>
      {record?.href && !current ? (
        <ArrowRight
          className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600 dark:group-hover:text-brand-300"
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  const className = `group flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
    current
      ? "border-brand-200 bg-brand-50/40 dark:border-brand-900/50 dark:bg-brand-900/10"
      : record?.href
        ? "border-gray-200 bg-white hover:border-brand-200 hover:bg-brand-50/30 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:border-brand-900/50 dark:hover:bg-brand-900/10"
        : "border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]"
  }`;

  if (record?.href && !current) {
    return (
      <Link href={record.href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} aria-current={current ? "page" : undefined}>
      {content}
    </div>
  );
}

export default function ConnectedRecordContext({
  company,
  currentRecord,
  nextAction,
  person,
  sale,
}: ConnectedRecordContextProps) {
  const records = { company, person, sale };

  return (
    <section
      aria-label="Connected customer context"
      className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Connected customer context
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Company, person and active sale
          </p>
        </div>
        <div className="max-w-full text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Next action:
          </span>{" "}
          <span>{nextAction?.trim() || "Not captured"}</span>
        </div>
      </div>
      <div className="grid gap-2 p-3 md:grid-cols-3">
        {recordTypes.map(({ Icon, key }) => (
          <ConnectedRecordCard
            key={key}
            Icon={Icon}
            current={currentRecord === key}
            record={records[key]}
          />
        ))}
      </div>
    </section>
  );
}
