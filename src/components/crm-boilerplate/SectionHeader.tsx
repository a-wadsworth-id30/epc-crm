import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";

export default function SectionHeader({
  actions,
  description,
  help,
  title,
}: {
  actions?: React.ReactNode;
  description?: string;
  help: string;
  title: string;
}) {
  return (
    <div className="border-b border-gray-200 p-5 dark:border-gray-800">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <h2 className="min-w-0 break-words text-base font-semibold text-gray-800 dark:text-white/90">
              {title}
            </h2>
            <LazyHelpTooltip content={help} />
          </div>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
