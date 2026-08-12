"use client";

import dynamic from "next/dynamic";
import type { ModuleToggles } from "@/lib/module-toggles";
import type { HeaderSearchRole } from "@/lib/navigation/header-search";

type HeaderSearchProps = {
  companiesEnabled: boolean;
  currentUserRole: HeaderSearchRole;
  enableGlobalShortcut?: boolean;
  moduleToggles: ModuleToggles;
  onNavigate?: () => void;
};

function HeaderSearchLoading() {
  return (
    <div className="h-11 w-full max-w-[430px] rounded-lg border border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex h-full items-center gap-3">
        <div className="h-5 w-5 rounded-full bg-gray-100 dark:bg-white/[0.08]" />
        <div className="h-4 w-44 rounded bg-gray-100 dark:bg-white/[0.08]" />
      </div>
    </div>
  );
}

const HeaderSearch = dynamic<HeaderSearchProps>(
  () => import("@/layout/HeaderSearch"),
  {
    loading: HeaderSearchLoading,
    ssr: false,
  },
);

export default HeaderSearch;
