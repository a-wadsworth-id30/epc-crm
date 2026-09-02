import {
  customerSalesCategoryOption,
  type CustomerSalesCategoryValue,
} from "@/lib/sales/customer-sales-category";

export default function CustomerSalesCategoryBadge({
  category,
}: {
  category: CustomerSalesCategoryValue;
}) {
  const option = customerSalesCategoryOption(category);

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${option.className}`}
    >
      <span className="truncate">{option.label}</span>
    </span>
  );
}
