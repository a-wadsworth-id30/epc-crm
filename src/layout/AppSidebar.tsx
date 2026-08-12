"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SidebarMinusIcon,
  SidebarPlusIcon,
  sidebarIcons,
} from "@/layout/SidebarIcons";
import AppLogo from "@/components/crm-boilerplate/AppLogo";
import { useSidebar } from "@/context/SidebarContext";
import type { CompanyProfile } from "@/lib/company-profile";
import type { ModuleToggleKey, ModuleToggles } from "@/lib/module-toggles";
import type { SidebarSettingsMenuProps } from "@/layout/SidebarSettingsMenu";

const ApplicationHealthWidget = dynamic(
  () => import("@/components/crm-boilerplate/ApplicationHealthWidget"),
  {
    loading: () => null,
    ssr: false,
  },
);

const SidebarSettingsMenu = dynamic<SidebarSettingsMenuProps>(
  () => import("@/layout/SidebarSettingsMenu"),
  {
    loading: () => null,
    ssr: false,
  },
);

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  adminOnly?: boolean;
  moduleKey?: ModuleToggleKey;
  requiresCompanies?: boolean;
  subItems?: NavSubItem[];
};

type NavSubItem = {
  name: string;
  path?: string;
  adminOnly?: boolean;
  moduleKey?: ModuleToggleKey;
  requiresCompanies?: boolean;
  subItems?: NavSubItem[];
};

type NavSection = {
  name: string;
  items: NavItem[];
};

const telephonySubItems: NavSubItem[] = [
  {
    name: "Phone System",
    path: "/telephony",
  },
  {
    name: "Call Tracking",
    path: "/telephony/call-tracking",
  },
];

const marketingSubItems: NavSubItem[] = [
  {
    name: "Marketing",
    path: "/marketing",
  },
  {
    name: "Tracking Engine",
    path: "/settings/attribution/tracking-script",
    adminOnly: true,
    moduleKey: "marketing",
  },
];

const productSubItems: NavSubItem[] = [
  {
    name: "Products",
    path: "/products",
  },
  {
    name: "Categories",
    path: "/products/categories",
  },
  {
    name: "Inventory",
    path: "/products/inventory",
  },
];

const contactSubItems: NavSubItem[] = [
  {
    name: "People",
    path: "/contacts",
  },
  {
    name: "Companies",
    path: "/clients",
    requiresCompanies: true,
  },
  {
    name: "Segments",
    path: "/contacts/segments",
  },
];

const navSections: NavSection[] = [
  {
    name: "Home",
    items: [
      { icon: sidebarIcons.layoutDashboard, name: "Dashboard", path: "/" },
      { icon: sidebarIcons.chartColumn, name: "Reports", path: "/reports" },
      { icon: sidebarIcons.squareCheckBig, name: "Tasks", path: "/tasks" },
    ],
  },
  {
    name: "CRM",
    items: [
      { icon: sidebarIcons.circleDollarSign, name: "Sales", path: "/sales" },
      {
        icon: sidebarIcons.usersRound,
        name: "Contacts",
        subItems: contactSubItems,
      },
      {
        icon: sidebarIcons.listTodo,
        name: "Notes / Activity",
        path: "/notes",
      },
      {
        icon: sidebarIcons.clipboardList,
        name: "Discovery",
        path: "/discovery",
        adminOnly: true,
        moduleKey: "discovery",
      },
    ],
  },
  {
    name: "Communications",
    items: [
      { icon: sidebarIcons.inbox, name: "Inbox", path: "/inbox" },
      {
        icon: sidebarIcons.headphones,
        name: "Telephony",
        adminOnly: true,
        moduleKey: "telephony",
        subItems: telephonySubItems,
      },
    ],
  },
  {
    name: "Marketing",
    items: [
      {
        icon: sidebarIcons.megaphone,
        name: "Marketing",
        moduleKey: "marketing",
        subItems: marketingSubItems,
      },
    ],
  },
  {
    name: "Products & Operations",
    items: [
      {
        icon: sidebarIcons.boxes,
        name: "Products",
        adminOnly: true,
        moduleKey: "products",
        subItems: productSubItems,
      },
      {
        icon: sidebarIcons.folderArchive,
        name: "Storage",
        path: "/storage",
        adminOnly: true,
      },
    ],
  },
];

function ShopifySubmenuMarker({ active = false }: { active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-px h-1.5 w-1.5 shrink-0 rotate-[-45deg] border-r border-b transition-colors ${
        active
          ? "border-gray-700 dark:border-gray-200"
          : "border-gray-500 group-hover:border-gray-700 dark:border-gray-400 dark:group-hover:border-gray-200"
      }`}
    />
  );
}

export default function AppSidebar({
  currentUserRole,
  companiesEnabled,
  companyProfile,
  moduleToggles,
}: {
  currentUserRole: "ADMIN" | "USER";
  companiesEnabled: boolean;
  companyProfile: CompanyProfile;
  moduleToggles: ModuleToggles;
}) {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const visibleSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              (!item.adminOnly || currentUserRole === "ADMIN") &&
              (!item.moduleKey || moduleToggles[item.moduleKey]) &&
              (!item.requiresCompanies || companiesEnabled),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [companiesEnabled, currentUserRole, moduleToggles],
  );
  const currentQuery = searchParams.toString();
  const currentPath = currentQuery ? `${pathname}?${currentQuery}` : pathname;
  const pathWithoutQuery = (path: string) => path.split(/[?#]/)[0] || path;
  const isActive = (path: string) => {
    if (path.includes("?")) return currentPath === path;
    const basePath = pathWithoutQuery(path);
    if (basePath === "/marketing")
      return pathname === "/marketing" || pathname.startsWith("/marketing/");
    if (basePath === "/settings/attribution/tracking-script") {
      return pathname.startsWith("/settings/attribution");
    }
    if (basePath === "/contacts") {
      return (
        pathname === "/contacts" ||
        (pathname.startsWith("/contacts/") &&
          !pathname.startsWith("/contacts/segments"))
      );
    }
    if (basePath === "/contacts/segments") {
      return pathname === basePath || pathname.startsWith(`${basePath}/`);
    }
    if (basePath === "/products") {
      return pathname === "/products";
    }
    if (
      basePath === "/products/categories" ||
      basePath === "/products/inventory"
    ) {
      return pathname === basePath || pathname.startsWith(`${basePath}/`);
    }
    if (basePath === "/telephony")
      return (
        pathname === "/telephony" ||
        (pathname.startsWith("/telephony/") &&
          !pathname.startsWith("/telephony/call-tracking"))
      );
    if (basePath === "/telephony/call-tracking") {
      return pathname === basePath || pathname.startsWith(`${basePath}/`);
    }
    if (basePath === "/telephony/call-tracking/overview") {
      return pathname === "/telephony/call-tracking" || pathname === basePath;
    }
    return (
      pathname === basePath ||
      (basePath !== "/" && pathname.startsWith(basePath))
    );
  };
  const subItemIsVisible = (item: NavSubItem): boolean =>
    (!item.adminOnly || currentUserRole === "ADMIN") &&
    (!item.moduleKey || moduleToggles[item.moduleKey]) &&
    (!item.requiresCompanies || companiesEnabled) &&
    (!item.subItems || item.subItems.some(subItemIsVisible));
  const subItemIsActive = (item: NavSubItem): boolean =>
    Boolean(
      (item.path && isActive(item.path)) ||
      item.subItems?.some((subItem) => subItemIsActive(subItem)),
    );
  const firstVisiblePath = (items: NavSubItem[]): string | null => {
    for (const item of items) {
      if (!subItemIsVisible(item)) {
        continue;
      }

      if (item.path) {
        return item.path;
      }

      if (item.subItems) {
        const nestedPath = firstVisiblePath(item.subItems);

        if (nestedPath) {
          return nestedPath;
        }
      }
    }

    return null;
  };
  const navItemKey = (sectionName: string, itemName: string) =>
    `${sectionName}:${itemName}`;
  const activeSubmenu =
    visibleSections
      .flatMap((section) =>
        section.items.map((item) => ({
          item,
          key: navItemKey(section.name, item.name),
        })),
      )
      .find(
        ({ item }) =>
          item.subItems?.some((subItem) => subItemIsActive(subItem)) ||
          (item.path ? pathname === pathWithoutQuery(item.path) : false),
      )?.key ?? null;
  const displayedSubmenu =
    openSubmenu ?? activeSubmenu;
  const isSettingsActive = pathname.startsWith("/settings");
  const isSidebarOpen = isExpanded || isHovered || isMobileOpen;
  const showLabels = isSidebarOpen;

  const renderSubItems = (items: NavSubItem[], depth = 0) => {
    const visibleSubItems = items.filter(subItemIsVisible);
    const activeSubItemIndex = visibleSubItems.findIndex(subItemIsActive);

    return (
      <ul
        className={
          depth === 0
            ? "sidebar-submenu-list"
            : "sidebar-submenu-list sidebar-submenu-list-nested"
        }
      >
        {visibleSubItems.map((item, itemIndex) => {
          const active = item.subItems
            ? subItemIsActive(item)
            : item.path
              ? isActive(item.path)
              : false;
          const beforeActive =
            activeSubItemIndex > -1 && itemIndex < activeSubItemIndex;

          return (
            <li key={item.path ?? item.name} className="sidebar-submenu-node">
              {item.subItems ? (
                <div>
                  <div
                    className={`group sidebar-submenu-row menu-dropdown-item menu-dropdown-item-inactive ${
                      active ? "sidebar-submenu-row-active" : ""
                    } ${beforeActive ? "sidebar-submenu-row-line" : ""}`}
                  >
                    <span className="truncate">{item.name}</span>
                    <ShopifySubmenuMarker active={active} />
                  </div>
                  {renderSubItems(item.subItems, depth + 1)}
                </div>
              ) : item.path ? (
                <Link
                  href={item.path}
                  className={`sidebar-submenu-row menu-dropdown-item ${
                    active
                      ? "menu-dropdown-item-active sidebar-submenu-row-active"
                      : "menu-dropdown-item-inactive"
                  } ${beforeActive ? "sidebar-submenu-row-line" : ""}`}
                >
                  <span className="truncate">{item.name}</span>
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <aside
      className={`fixed top-0 left-0 z-50 h-full flex-col overflow-x-hidden border-r border-gray-200 bg-gray-100 px-3 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-950 ${
        isSidebarOpen ? "w-[240px]" : "w-[72px]"
      } ${
        isMobileOpen
          ? "flex translate-x-0"
          : "hidden -translate-x-full xl:flex xl:translate-x-0"
      }`}
      onMouseEnter={() => {
        if (!isExpanded && !isMobileOpen) {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`flex py-4 ${!isExpanded && !isHovered ? "xl:justify-center" : "justify-start"}`}
      >
        <Link href="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <span className="sidebar-label-enter block">
              <AppLogo
                className="h-8 max-w-[180px]"
                companyProfile={companyProfile}
                width={120}
                height={54}
                priority
              />
            </span>
          ) : (
            <AppLogo
              className="h-6 max-w-10"
              companyProfile={companyProfile}
              variant="icon"
              width={54}
              height={24}
              priority
            />
          )}
        </Link>
      </div>

      <nav className="no-scrollbar flex flex-1 flex-col overflow-y-auto pb-4 duration-300 ease-linear">
        <ul className="flex flex-col gap-3">
          {visibleSections.map((section, sectionIndex) => (
            <li key={section.name}>
              {showLabels ? (
                <div className="sidebar-label-enter truncate whitespace-nowrap px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">
                  {section.name}
                </div>
              ) : (
                <>
                  <span className="sr-only">{section.name}</span>
                  {sectionIndex > 0 ? (
                    <div
                      aria-hidden="true"
                      className="mx-auto my-1 h-px w-8 bg-gray-200 dark:bg-gray-800"
                    />
                  ) : null}
                </>
              )}
              <ul className="flex flex-col gap-0.5">
                {section.items.map((nav) => {
                  const itemKey = navItemKey(section.name, nav.name);

                  return (
                    <li key={itemKey}>
                      {nav.subItems ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenSubmenu(itemKey);
                              const firstPath = firstVisiblePath(
                                nav.subItems ?? [],
                              );

                              if (firstPath && currentPath !== firstPath) {
                                router.push(firstPath);
                              }
                            }}
                            className={`group menu-item menu-item-inactive cursor-pointer ${
                              !showLabels
                                ? "lg:justify-center"
                                : "lg:justify-start"
                            }`}
                          >
                            <span className="menu-item-icon-inactive">
                              {nav.icon}
                            </span>
                            {showLabels && (
                              <span className="sidebar-label-enter menu-item-text flex min-w-0 items-center gap-1.5">
                                <span className="truncate">{nav.name}</span>
                                <ShopifySubmenuMarker
                                  active={displayedSubmenu === itemKey}
                                />
                              </span>
                            )}
                          </button>
                          {showLabels && (
                            <div
                              className={
                                displayedSubmenu === itemKey
                                  ? "sidebar-label-enter block"
                                  : "hidden"
                              }
                            >
                              {renderSubItems(nav.subItems)}
                            </div>
                          )}
                        </>
                      ) : (
                        nav.path && (
                          <Link
                            href={nav.path}
                            className={`group menu-item ${
                              isActive(nav.path)
                                ? "menu-item-active"
                                : "menu-item-inactive"
                            } ${
                              !showLabels
                                ? "lg:justify-center"
                                : "lg:justify-start"
                            }`}
                          >
                            <span
                              className={
                                isActive(nav.path)
                                  ? "menu-item-icon-active"
                                  : "menu-item-icon-inactive"
                              }
                            >
                              {nav.icon}
                            </span>
                            {showLabels && (
                              <span className="sidebar-label-enter menu-item-text min-w-0 truncate">
                                {nav.name}
                              </span>
                            )}
                          </Link>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      <ApplicationHealthWidget showLabels={showLabels} />

      <div className="relative border-t border-gray-200 py-2.5 dark:border-gray-800">
        <button
          ref={settingsTriggerRef}
          type="button"
          onClick={() => setIsSettingsOpen((open) => !open)}
          className={`group menu-item relative z-20 w-full cursor-pointer ${
            isSettingsActive || isSettingsOpen
              ? "menu-item-active"
              : "menu-item-inactive"
          } ${!showLabels ? "lg:justify-center" : "lg:justify-start"}`}
          aria-expanded={isSettingsOpen}
          aria-haspopup="menu"
        >
          <span
            className={
              isSettingsActive || isSettingsOpen
                ? "menu-item-icon-active"
                : "menu-item-icon-inactive"
            }
          >
            {sidebarIcons.settings}
          </span>
          {showLabels && (
            <span className="sidebar-label-enter menu-item-text min-w-0 truncate">
              Settings
            </span>
          )}
          {showLabels && (
            <span className="sidebar-label-enter ml-auto flex h-5 w-5 items-center justify-center">
              <SidebarMinusIcon
                className={
                  isSettingsOpen
                    ? "block text-gray-700 dark:text-gray-200"
                    : "hidden"
                }
              />
              <SidebarPlusIcon
                className={isSettingsOpen ? "hidden" : "block"}
              />
            </span>
          )}
        </button>
        {isSettingsOpen && (
          <SidebarSettingsMenu
            currentUserRole={currentUserRole}
            moduleToggles={moduleToggles}
            onClose={closeSettings}
            pathname={pathname}
            showLabels={showLabels}
            triggerRef={settingsTriggerRef}
          />
        )}
      </div>
    </aside>
  );
}
