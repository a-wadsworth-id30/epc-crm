import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";

type PlaceholderItem = {
  title: string;
  detail: string;
};

export default function AttributionPlaceholderSection({
  eyebrow,
  title,
  description,
  items,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: PlaceholderItem[];
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
          {eyebrow}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            {title}
          </h2>
          <LazyHelpTooltip content={description} />
        </div>
        <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {item.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
