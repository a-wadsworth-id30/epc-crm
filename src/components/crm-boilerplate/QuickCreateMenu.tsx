"use client";

import dynamic from "next/dynamic";
import type { ComponentType, SVGProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AddSaleModalProps } from "@/components/crm-boilerplate/AddSaleModal";
import type { CompanyCreateModalProps } from "@/components/crm-boilerplate/CompanyModals";
import type { ContactCreateModalProps } from "@/components/crm-boilerplate/ContactModals";
import {
  DollarLineIcon,
  PlusIcon,
  ProfileAltIcon,
  UserIcon,
  UserMoneyIcon,
} from "@/icons";
import { cn } from "@/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type QuickCreateIntent = "contact" | "deal" | "lead" | "organisation";

type QuickCreateOptions = {
  addressLookupEnabled: boolean;
  companies: Array<{ id: string; name: string }>;
  companiesEnabled: boolean;
  contacts: Array<{
    companyId: string | null;
    companyName: string | null;
    email: string | null;
    id: string;
    leadSource: string | null;
    name: string;
    phone: string | null;
  }>;
  contactTags: Array<{ id: string; name: string }>;
  sales: {
    defaultOwnerId: string | null;
    defaultStageId: string | null;
    owners: Array<{ label: string; value: string }>;
    stages: Array<{ bucket: string; label: string; value: string }>;
  };
};

type QuickCreateMenuProps = {
  companiesEnabled: boolean;
  variant?: "icon" | "wide";
};

const LoadedContactCreateModal = dynamic<ContactCreateModalProps>(
  () =>
    import("@/components/crm-boilerplate/ContactModals").then(
      (module) => module.ContactCreateModal,
    ),
  { loading: () => null, ssr: false },
);

const LoadedCompanyCreateModal = dynamic<CompanyCreateModalProps>(
  () =>
    import("@/components/crm-boilerplate/CompanyModals").then(
      (module) => module.CompanyCreateModal,
    ),
  { loading: () => null, ssr: false },
);

const LoadedAddSaleModal = dynamic<AddSaleModalProps>(
  () => import("@/components/crm-boilerplate/AddSaleModal"),
  { loading: () => null, ssr: false },
);

export default function QuickCreateMenu({
  companiesEnabled,
  variant = "icon",
}: QuickCreateMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsPromiseRef = useRef<Promise<QuickCreateOptions> | null>(null);
  const [activeIntent, setActiveIntent] = useState<QuickCreateIntent | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [options, setOptions] = useState<QuickCreateOptions | null>(null);

  const loadOptions = useCallback(async () => {
    if (options) return options;

    if (!optionsPromiseRef.current) {
      setIsLoading(true);
      setLoadError(null);
      optionsPromiseRef.current = fetch("/api/quick-create/options", {
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load create options.");
        }

        return (await response.json()) as QuickCreateOptions;
      });
    }

    try {
      const loadedOptions = await optionsPromiseRef.current;
      setOptions(loadedOptions);
      return loadedOptions;
    } catch {
      optionsPromiseRef.current = null;
      setLoadError("Could not load create options.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  useEffect(() => {
    if (isMenuOpen) {
      void loadOptions();
    }
  }, [isMenuOpen, loadOptions]);

  useEffect(() => {
    if (!isMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMenuOpen]);

  async function openCreateIntent(intent: QuickCreateIntent) {
    const loadedOptions = await loadOptions();

    if (!loadedOptions) return;
    if (intent === "organisation" && !loadedOptions.companiesEnabled) return;

    setActiveIntent(intent);
    setIsMenuOpen(false);
    setModalKey((current) => current + 1);
  }

  const organisationEnabled = options?.companiesEnabled ?? companiesEnabled;
  const menuItems: Array<{
    description: string;
    disabled?: boolean;
    icon: IconComponent;
    id: QuickCreateIntent;
    label: string;
  }> = [
    {
      description: "Add a person and source.",
      icon: UserIcon,
      id: "contact",
      label: "Contact",
    },
    {
      description: organisationEnabled
        ? "Create an account record."
        : "Enable Companies to use this.",
      disabled: !organisationEnabled,
      icon: ProfileAltIcon,
      id: "organisation",
      label: "Organisation",
    },
    {
      description: "Capture a new enquiry.",
      icon: UserMoneyIcon,
      id: "lead",
      label: "Lead",
    },
    {
      description: "Create a sales opportunity.",
      icon: DollarLineIcon,
      id: "deal",
      label: "Deal",
    },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-label="Create record"
        title="Create"
        onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden",
          variant === "wide" ? "w-full px-4" : "w-11",
        )}
      >
        <PlusIcon className="size-4" />
        {variant === "wide" ? <span>Create</span> : null}
      </button>

      {isMenuOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-[100000] mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950"
        >
          <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Create
            </p>
          </div>
          <div className="p-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const disabled = item.disabled || (isLoading && !options);

              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => void openCreateIntent(item.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/[0.05]"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
                      {item.label}
                    </span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {isLoading && !options ? "Loading setup..." : item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {loadError ? (
            <div className="border-t border-error-100 px-3 py-2 text-xs font-medium text-error-600 dark:border-error-900/40 dark:text-error-300">
              {loadError}
            </div>
          ) : null}
        </div>
      ) : null}

      {options && activeIntent === "contact" ? (
        <LoadedContactCreateModal
          key={`contact-${modalKey}`}
          addressLookupEnabled={options.addressLookupEnabled}
          autoOpen
          availableTags={options.contactTags}
          companies={options.companies}
          companiesEnabled={options.companiesEnabled}
          hideTrigger
        />
      ) : null}

      {options && activeIntent === "organisation" ? (
        <LoadedCompanyCreateModal
          key={`organisation-${modalKey}`}
          addressLookupEnabled={options.addressLookupEnabled}
          autoOpen
          hideTrigger
        />
      ) : null}

      {options && activeIntent === "lead" ? (
        <LoadedAddSaleModal
          key={`lead-${modalKey}`}
          autoOpen
          companies={options.companies}
          companiesEnabled={options.companiesEnabled}
          contacts={options.contacts}
          defaultOwnerId={options.sales.defaultOwnerId}
          defaultStageId={options.sales.defaultStageId}
          hideTrigger
          modalDescription="Create a new sales lead for an enquiry that needs follow-up."
          modalTitle="Create lead"
          owners={options.sales.owners}
          requireLinkedContact
          stages={options.sales.stages}
          submitLabel="Create lead"
        />
      ) : null}

      {options && activeIntent === "deal" ? (
        <LoadedAddSaleModal
          key={`deal-${modalKey}`}
          autoOpen
          companies={options.companies}
          companiesEnabled={options.companiesEnabled}
          contacts={options.contacts}
          defaultOwnerId={options.sales.defaultOwnerId}
          defaultStageId={options.sales.defaultStageId}
          hideTrigger
          modalDescription="Create a sales opportunity with value, stage, owner and next step."
          modalTitle="Create deal"
          owners={options.sales.owners}
          requireLinkedContact
          stages={options.sales.stages}
          submitLabel="Create deal"
        />
      ) : null}
    </div>
  );
}
