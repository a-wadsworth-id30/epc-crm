"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { CurrentUser } from "@/lib/auth";
import type { UserDropdownMenuProps } from "@/components/header/UserDropdownMenu";

const fallbackUser: CurrentUser = {
  id: "demo",
  name: "CRM User",
  firstName: "CRM",
  lastName: "User",
  avatarUrl: null,
  landline: null,
  mobile: null,
  email: "user@example.com",
  role: "USER",
  browserSoftphoneEnabled: false,
};

const UserDropdownMenu = dynamic<UserDropdownMenuProps>(
  () => import("@/components/header/UserDropdownMenu"),
  {
    loading: () => null,
    ssr: false,
  },
);

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneMode() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export default function UserDropdown({
  currentUser = fallbackUser,
}: {
  currentUser?: CurrentUser;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(isStandaloneMode);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const standaloneMedia = window.matchMedia("(display-mode: standalone)");

    function handleDisplayModeChange() {
      setIsStandalone(isStandaloneMode());
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setIsStandalone(true);
      setDeferredPrompt(null);
      closeDropdown();
    }

    standaloneMedia.addEventListener("change", handleDisplayModeChange);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      standaloneMedia.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [closeDropdown]);

  async function installApp() {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    setDeferredPrompt(null);
    closeDropdown();
  }

  const initials =
    `${currentUser.firstName?.[0] ?? currentUser.name[0] ?? ""}${
      currentUser.lastName?.[0] ?? ""
    }`.toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="dropdown-toggle flex items-center text-gray-700 dark:text-gray-400"
        aria-expanded={isOpen}
        aria-label="Open user menu"
      >
        <span
          className="mr-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gray-100 bg-cover bg-center text-sm font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300"
          style={
            currentUser.avatarUrl
              ? { backgroundImage: `url(${currentUser.avatarUrl})` }
              : undefined
          }
        >
          {currentUser.avatarUrl ? (
            <span className="sr-only">User</span>
          ) : (
            initials
          )}
        </span>

        <span className="block mr-1 font-medium text-theme-sm">
          {currentUser.name}
        </span>

        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen ? (
        <UserDropdownMenu
          canInstallApp={!isStandalone && Boolean(deferredPrompt)}
          currentUser={currentUser}
          isOpen={isOpen}
          onClose={closeDropdown}
          onInstallApp={() => void installApp()}
        />
      ) : null}
    </div>
  );
}
