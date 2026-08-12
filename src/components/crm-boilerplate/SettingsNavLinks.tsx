"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SettingsNavItem = {
  label: string;
  href: string;
  adminOnly?: boolean;
};

export default function SettingsNavLinks({ items }: { items: SettingsNavItem[] }) {
  const pathname = usePathname();

  if (pathname.startsWith("/settings/attribution")) {
    return null;
  }

  return (
    <div className="mb-6 max-w-full min-w-0 border-b border-gray-200 dark:border-gray-800 sm:overflow-x-auto sm:overscroll-x-contain">
      <nav className="flex flex-wrap gap-1 sm:inline-flex sm:w-max sm:max-w-none sm:flex-nowrap">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4 ${
                isActive
                  ? "border-brand-500 text-brand-500 dark:text-brand-400"
                  : "border-transparent text-gray-600 hover:border-brand-500 hover:text-brand-500 dark:text-gray-400"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
