"use client";

import Link from "next/link";
import {
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { ModuleToggleKey, ModuleToggles } from "@/lib/module-toggles";

type SidebarSettingsItem = {
  name: string;
  path: string;
  adminOnly?: boolean;
  moduleKey?: ModuleToggleKey;
};

export type SidebarSettingsMenuProps = {
  currentUserRole: "ADMIN" | "USER";
  moduleToggles: ModuleToggles;
  onClose: () => void;
  pathname: string;
  showLabels: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

const settingsItems: SidebarSettingsItem[] = [
  { name: "General Settings", path: "/settings/general", adminOnly: true },
  { name: "Company Profile", path: "/settings/company", adminOnly: true },
  {
    name: "AI Context",
    path: "/settings/ai-context",
    adminOnly: true,
    moduleKey: "ai",
  },
  { name: "Users & Permissions", path: "/settings/users", adminOnly: true },
  { name: "Sales Pipeline", path: "/settings/sales-pipeline", adminOnly: true },
  {
    name: "Sales Automation",
    path: "/settings/sales-automation",
    adminOnly: true,
  },
  { name: "Integrations", path: "/settings/integrations", adminOnly: true },
  { name: "Security", path: "/settings/security", adminOnly: true },
  { name: "System / Developer", path: "/settings/system", adminOnly: true },
];

function pathWithoutQuery(path: string) {
  return path.split(/[?#]/)[0] || path;
}

export default function SidebarSettingsMenu({
  currentUserRole,
  moduleToggles,
  onClose,
  pathname,
  showLabels,
  triggerRef,
}: SidebarSettingsMenuProps) {
  const [settingsMenuStyle, setSettingsMenuStyle] =
    useState<CSSProperties | null>(null);
  const visibleSettingsItems = useMemo(
    () =>
      settingsItems.filter(
        (item) =>
          (!item.adminOnly || currentUserRole === "ADMIN") &&
          (!item.moduleKey || moduleToggles[item.moduleKey]),
      ),
    [currentUserRole, moduleToggles],
  );

  useLayoutEffect(() => {
    function updateSettingsMenuPosition() {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const margin = 16;
      const gap = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const bottom = Math.max(margin, viewportHeight - rect.top + gap);
      const maxHeight = Math.max(160, viewportHeight - bottom - margin);

      if (showLabels) {
        setSettingsMenuStyle({
          left: rect.left,
          width: rect.width,
          bottom,
          maxHeight,
        });
        return;
      }

      const collapsedWidth = 256;
      const preferredLeft = rect.right + 12;
      const fitsRight =
        preferredLeft + collapsedWidth <= viewportWidth - margin;

      setSettingsMenuStyle({
        left: fitsRight ? preferredLeft : undefined,
        right: fitsRight ? undefined : margin,
        width: collapsedWidth,
        bottom,
        maxHeight,
      });
    }

    updateSettingsMenuPosition();
    window.addEventListener("resize", updateSettingsMenuPosition);
    window.addEventListener("scroll", updateSettingsMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateSettingsMenuPosition);
      window.removeEventListener("scroll", updateSettingsMenuPosition, true);
    };
  }, [showLabels, triggerRef]);

  function isActive(path: string) {
    const basePath = pathWithoutQuery(path);

    return pathname === basePath || pathname.startsWith(`${basePath}/`);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close settings menu"
        className="fixed inset-0 z-10 cursor-default bg-transparent"
        onClick={onClose}
      />
      <div
        className="fixed z-30 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
        style={settingsMenuStyle ?? undefined}
      >
        <ul className="space-y-1">
          {visibleSettingsItems.map((item) => (
            <li key={item.path}>
              <Link
                href={item.path}
                onClick={onClose}
                className={`menu-dropdown-item ${
                  isActive(item.path)
                    ? "menu-dropdown-item-active"
                    : "menu-dropdown-item-inactive"
                }`}
              >
                <span className="truncate">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
