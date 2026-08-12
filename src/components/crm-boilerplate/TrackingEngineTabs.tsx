import Link from "next/link";
import {
  attributionSettingsPath,
  attributionSettingsSections,
  type AttributionSettingsSectionSlug,
} from "@/lib/attribution/settings-sections";

export default function TrackingEngineTabs({
  activeSection,
}: {
  activeSection: AttributionSettingsSectionSlug;
}) {
  return (
    <nav
      aria-label="Tracking Engine sections"
      className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="flex min-w-max gap-2">
        {attributionSettingsSections.map((section) => {
          const isActive = activeSection === section.slug;

          return (
            <Link
              key={section.slug}
              href={attributionSettingsPath(section.slug)}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition ${
                isActive
                  ? "bg-brand-500 text-white shadow-theme-xs"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              }`}
              title={section.description}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
