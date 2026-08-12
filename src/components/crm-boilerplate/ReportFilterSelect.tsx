type ReportFilterSelectOption = {
  label: string;
  value: string;
};

export default function ReportFilterSelect({
  defaultValue,
  hiddenLabel = false,
  label,
  name,
  options,
  size = "default",
}: {
  defaultValue: string;
  hiddenLabel?: boolean;
  label: string;
  name: string;
  options: readonly ReportFilterSelectOption[];
  size?: "compact" | "default" | "large";
}) {
  const heightClass =
    size === "compact" ? "h-9" : size === "large" ? "h-11" : "h-10";

  return (
    <label className="block">
      <span
        className={
          hiddenLabel
            ? "sr-only"
            : "mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400"
        }
      >
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className={`w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm font-medium text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90 ${heightClass}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
