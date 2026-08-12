"use client";

import { logoutAction } from "@/lib/actions/auth";
import type { CurrentUser } from "@/lib/auth";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

export type UserDropdownMenuProps = {
  canInstallApp: boolean;
  currentUser: CurrentUser;
  isOpen: boolean;
  onClose: () => void;
  onInstallApp: () => void;
};

const menuItemClassName =
  "flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300";
const iconClassName =
  "h-6 w-6 stroke-gray-500 group-hover:stroke-gray-700 dark:stroke-gray-400 dark:group-hover:stroke-gray-300";

function AccountIcon() {
  return (
    <svg
      className={iconClassName}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 21a8 8 0 0 0-16 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function InstallAppIcon() {
  return (
    <svg
      className={iconClassName}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3v10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m8 10 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14.5V18a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg
      className={iconClassName}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M15 17l5-5-5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 12H9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PwaInstallMenuItem({ onInstallApp }: { onInstallApp: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onInstallApp}
        className={`w-full ${menuItemClassName}`}
      >
        <InstallAppIcon />
        Install desktop app
      </button>
    </li>
  );
}

export default function UserDropdownMenu({
  canInstallApp,
  currentUser,
  isOpen,
  onClose,
  onInstallApp,
}: UserDropdownMenuProps) {
  return (
    <Dropdown
      isOpen={isOpen}
      onClose={onClose}
      className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
    >
      <div>
        <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
          {currentUser.name}
        </span>
        <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
          {currentUser.email}
        </span>
      </div>

      <ul className="flex flex-col gap-1 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
        <li>
          <DropdownItem
            onItemClick={onClose}
            tag="a"
            href="/profile"
            className={menuItemClassName}
          >
            <AccountIcon />
            My account
          </DropdownItem>
        </li>
        {canInstallApp ? (
          <PwaInstallMenuItem onInstallApp={onInstallApp} />
        ) : null}
      </ul>

      <form action={logoutAction}>
        <button type="submit" className={`mt-3 w-full ${menuItemClassName}`}>
          <SignOutIcon />
          Sign out
        </button>
      </form>
    </Dropdown>
  );
}
