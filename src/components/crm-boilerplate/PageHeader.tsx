import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";

export default function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-2">
          <h1 className="min-w-0 break-words text-2xl font-semibold text-gray-800 dark:text-white/90 sm:text-title-sm lg:text-title-md">
            {title}
          </h1>
          {description && <LazyHelpTooltip content={description} />}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>}
        {children}
      </div>
      {actions && (
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
