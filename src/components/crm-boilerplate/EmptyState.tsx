export default function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-white/[0.03]">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}
