import Link from "next/link";
import { callTrackingNavItems } from "@/lib/telephony/navigation";

export default function CallTrackingTabs({ activeHref }: { activeHref: string }) {
  return (
    <nav
      aria-label="Call tracking sections"
      className="mb-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:w-max sm:min-w-max">
        {callTrackingNavItems.map((item) => {
          const active =
            activeHref === item.href ||
            (item.href === "/telephony/call-tracking/overview" &&
              activeHref === "/telephony/call-tracking");

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-10 min-w-0 items-center justify-center rounded-lg px-3 text-sm font-semibold transition sm:px-4 ${
                active ? "order-first md:order-none" : ""
              } ${
                active
                  ? "bg-brand-500 text-white shadow-theme-xs"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              }`}
            >
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
