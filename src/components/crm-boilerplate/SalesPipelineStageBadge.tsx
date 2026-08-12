export default function SalesPipelineStageBadge({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200 ring-inset dark:bg-white/[0.05] dark:text-gray-300 dark:ring-gray-800">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
