"use client";

import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { CurrentUser } from "@/lib/auth";
import {
  getCompanyBrandStyle,
  type CompanyProfile,
} from "@/lib/company-profile";
import type { ModuleToggles } from "@/lib/module-toggles";
import type { HeaderNotification } from "@/lib/notifications";
import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import RouteChangeProgress from "@/components/crm-boilerplate/RouteChangeProgress";

const SoftphoneProvider = dynamic(
  () => import("@/components/crm-boilerplate/SoftphoneProvider"),
  {
    loading: () => null,
    ssr: false,
  },
);

const DeployVersionGuard = dynamic(
  () => import("@/components/crm-boilerplate/DeployVersionGuard"),
  {
    loading: () => null,
    ssr: false,
  },
);

export default function AdminShell({
  children,
  currentUser,
  companiesEnabled,
  companyProfile,
  moduleToggles,
  buildCommit,
  notifications = [],
}: {
  children: React.ReactNode;
  currentUser: CurrentUser;
  companiesEnabled: boolean;
  companyProfile: CompanyProfile;
  moduleToggles: ModuleToggles;
  buildCommit: string;
  notifications?: HeaderNotification[];
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const companyBrandStyle = getCompanyBrandStyle(companyProfile) as
    | CSSProperties
    | undefined;

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "xl:ml-[240px]"
      : "xl:ml-[72px]";
  const shouldMountSoftphone =
    moduleToggles.telephony && currentUser.browserSoftphoneEnabled === true;

  return (
    <>
      <div
        className="min-h-screen xl:flex"
        data-company-brand={companyBrandStyle ? "" : undefined}
        style={companyBrandStyle}
      >
        <AppSidebar
          currentUserRole={currentUser.role}
          companiesEnabled={companiesEnabled}
          companyProfile={companyProfile}
          moduleToggles={moduleToggles}
        />
        <Backdrop />
        <div
          className={`min-w-0 flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}
        >
          <AppHeader
            companiesEnabled={companiesEnabled}
            companyProfile={companyProfile}
            currentUser={currentUser}
            moduleToggles={moduleToggles}
            notifications={notifications}
          />
          <main className="min-w-0 p-4 md:p-6">{children}</main>
        </div>
      </div>
      {shouldMountSoftphone ? (
        <SoftphoneProvider currentUserId={currentUser.id}>
          {null}
        </SoftphoneProvider>
      ) : null}
      <RouteChangeProgress />
      <DeployVersionGuard currentCommit={buildCommit} />
    </>
  );
}
