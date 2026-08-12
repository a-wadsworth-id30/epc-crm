"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import SearchableCompanySelect from "@/components/crm-boilerplate/SearchableCompanySelect";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useModal } from "@/hooks/useModal";
import { PlusIcon } from "@/icons";
import { createSaleAction } from "@/lib/actions/sales";
import { leadSourceOptions } from "@/lib/sales/lead-sources";

type OwnerOption = {
  label: string;
  value: string;
};

type StageOption = {
  bucket: string;
  label: string;
  value: string;
};

type CompanyOption = {
  id: string;
  name: string;
};

type ContactOption = {
  companyId: string | null;
  companyName: string | null;
  email: string | null;
  id: string;
  leadSource: string | null;
  name: string;
  phone: string | null;
};

export type AddSaleModalProps = {
  autoOpen?: boolean;
  companies?: CompanyOption[];
  companiesEnabled?: boolean;
  contacts?: ContactOption[];
  hideTrigger?: boolean;
  linkedContact?: {
    companyId?: string | null;
    companyName?: string | null;
    id: string;
    leadSource?: string | null;
    name: string;
  };
  owners: OwnerOption[];
  defaultOwnerId?: string | null;
  defaultStageId?: string | null;
  stages: StageOption[];
  modalDescription?: string;
  modalTitle?: string;
  requireLinkedContact?: boolean;
  submitLabel?: string;
  triggerLabel?: string;
};

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

const textareaClassName =
  "min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

const contactModeButtonClassName = (isActive: boolean) =>
  `inline-flex h-9 flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold transition ${
    isActive
      ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/50"
      : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
  }`;

function splitContactName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function contactSearchText(contact: ContactOption) {
  return [
    contact.name,
    contact.companyName,
    contact.email,
    contact.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function SaleContactPicker({
  companies,
  companiesEnabled,
  contacts,
  onContactSelected,
  requireLinkedContact,
}: {
  companies: CompanyOption[];
  companiesEnabled: boolean;
  contacts: ContactOption[];
  onContactSelected: (contact: ContactOption) => void;
  requireLinkedContact: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [contactMode, setContactMode] = useState<"existing" | "new">(
    contacts.length ? "existing" : "new",
  );
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(
    null,
  );
  const [remoteSearch, setRemoteSearch] = useState<{
    contacts: ContactOption[];
    error: string | null;
    isLoading: boolean;
    query: string;
  }>({
    contacts: [],
    error: null,
    isLoading: false,
    query: "",
  });
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");

  useClickOutside(wrapperRef, () => setIsOpen(false));

  const trimmedQuery = query.trim();
  const shouldSearchContacts =
    contactMode === "existing" &&
    (trimmedQuery.length >= 2 || trimmedQuery.replace(/\D/g, "").length >= 3);
  const remoteSearchMatchesQuery =
    shouldSearchContacts && remoteSearch.query === trimmedQuery;
  const remoteContacts =
    remoteSearchMatchesQuery && !remoteSearch.error ? remoteSearch.contacts : null;
  const isSearchingContacts =
    remoteSearchMatchesQuery && remoteSearch.isLoading;
  const contactSearchError = remoteSearchMatchesQuery
    ? remoteSearch.error
    : null;

  useEffect(() => {
    const trimmedQuery = query.trim();
    const shouldSearch =
      contactMode === "existing" &&
      (trimmedQuery.length >= 2 || trimmedQuery.replace(/\D/g, "").length >= 3);

    if (!shouldSearch) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setRemoteSearch({
        contacts: [],
        error: null,
        isLoading: true,
        query: trimmedQuery,
      });
      fetch(`/api/quick-create/contacts?q=${encodeURIComponent(trimmedQuery)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Contact search failed");
          }

          const payload = (await response.json()) as {
            contacts?: ContactOption[];
          };
          setRemoteSearch({
            contacts: Array.isArray(payload.contacts) ? payload.contacts : [],
            error: null,
            isLoading: false,
            query: trimmedQuery,
          });
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setRemoteSearch({
            contacts: [],
            error: "Contact search is unavailable.",
            isLoading: false,
            query: trimmedQuery,
          });
        });
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [contactMode, query]);

  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedTerms = normalizedQuery.split(/\s+/).filter(Boolean);
    const availableContacts = remoteContacts ?? contacts;

    if (!normalizedQuery) return availableContacts.slice(0, 25);

    return availableContacts
      .filter((contact) => {
        const searchText = contactSearchText(contact);
        return normalizedTerms.every((term) => searchText.includes(term));
      })
      .slice(0, 25);
  }, [contacts, query, remoteContacts]);

  function switchToNewContact() {
    const splitName = splitContactName(query);
    setContactMode("new");
    setSelectedContact(null);
    setIsOpen(false);
    if (!newFirstName && splitName.firstName) {
      setNewFirstName(splitName.firstName);
    }
    if (!newLastName && splitName.lastName) {
      setNewLastName(splitName.lastName);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03] md:col-span-2">
      <input
        type="hidden"
        name="requireLinkedContact"
        value={requireLinkedContact ? "on" : ""}
      />
      <input type="hidden" name="contactMode" value={contactMode} />
      <input type="hidden" name="contactId" value={selectedContact?.id ?? ""} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Contact
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {selectedContact
              ? [selectedContact.email, selectedContact.phone, selectedContact.companyName]
                  .filter(Boolean)
                  .join(" · ") || "Selected contact"
              : "Search or create a linked person."}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-950">
          <button
            type="button"
            className={contactModeButtonClassName(contactMode === "existing")}
            onClick={() => setContactMode("existing")}
          >
            Existing
          </button>
          <button
            type="button"
            className={contactModeButtonClassName(contactMode === "new")}
            onClick={switchToNewContact}
          >
            New
          </button>
        </div>
      </div>

      {contactMode === "existing" ? (
        <div ref={wrapperRef} className="relative mt-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Existing contact
            </span>
            <input
              type="search"
              value={query}
              onFocus={() => setIsOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedContact(null);
                setIsOpen(true);
              }}
              placeholder="Search by name, email, phone or organisation"
              autoComplete="off"
              className={inputClassName}
            />
          </label>
          {isOpen ? (
            <div className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
              {contactSearchError ? (
                <div className="px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                  {contactSearchError}
                </div>
              ) : null}
              {isSearchingContacts ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  Searching contacts...
                </div>
              ) : null}
              {!isSearchingContacts ? filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => {
                    setSelectedContact(contact);
                    setQuery(contact.name);
                    setIsOpen(false);
                    onContactSelected(contact);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  <span className="block font-semibold text-gray-800 dark:text-white/90">
                    {contact.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                    {[contact.companyName, contact.email, contact.phone]
                      .filter(Boolean)
                      .join(" · ") || "No contact details"}
                  </span>
                </button>
              )) : null}
              {!isSearchingContacts && query.trim() ? (
                <button
                  type="button"
                  onClick={switchToNewContact}
                  className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20"
                >
                  Create <span className="font-semibold">{query.trim()}</span>
                </button>
              ) : null}
              {!isSearchingContacts && !filteredContacts.length && !query.trim() ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No contacts found
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              First name
            </span>
            <input
              name="newContactFirstName"
              value={newFirstName}
              onChange={(event) => setNewFirstName(event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Last name
            </span>
            <input
              name="newContactLastName"
              value={newLastName}
              onChange={(event) => setNewLastName(event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Email
            </span>
            <input
              name="newContactEmail"
              type="email"
              className={inputClassName}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Phone
            </span>
            <input
              name="newContactPhone"
              type="tel"
              className={inputClassName}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Role / job title
            </span>
            <input name="newContactRole" className={inputClassName} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Organisation
            </span>
            {companiesEnabled ? (
              <SearchableCompanySelect
                allowCreate
                id="sale-new-contact-company"
                companies={companies}
                companyIdName="newContactCompanyId"
                companyNameName="newContactCompanyName"
              />
            ) : (
              <input name="newContactCompanyName" className={inputClassName} />
            )}
          </label>
        </div>
      )}
    </section>
  );
}

export default function AddSaleModal({
  autoOpen,
  companies = [],
  companiesEnabled = false,
  contacts = [],
  hideTrigger = false,
  owners,
  defaultOwnerId,
  defaultStageId,
  linkedContact,
  modalDescription,
  modalTitle,
  requireLinkedContact = false,
  stages,
  submitLabel,
  triggerLabel = "Add sale",
}: AddSaleModalProps) {
  const modal = useModal();
  const { openModal } = modal;
  const router = useRouter();
  const defaultPipelineStageId =
    defaultStageId && stages.some((stage) => stage.value === defaultStageId)
      ? defaultStageId
      : stages[0]?.value ?? "";
  const defaultTitle = linkedContact ? `${linkedContact.name} enquiry` : "";
  const defaultLeadSource = linkedContact?.leadSource ?? "";
  const [leadSourceValue, setLeadSourceValue] = useState(defaultLeadSource);
  const [titleValue, setTitleValue] = useState(defaultTitle);
  const resolvedModalTitle = linkedContact
    ? "Create lead"
    : (modalTitle ?? "Add sale");
  const resolvedModalDescription = linkedContact
    ? "Create a pipeline record linked to this contact."
    : (modalDescription ??
      "Create a manual pipeline record for a lead or opportunity.");
  const resolvedSubmitLabel = linkedContact
    ? "Create lead"
    : (submitLabel ?? "Add sale");
  const [state, formAction, isPending] = useActionState(createSaleAction, {
    ok: false,
    message: "",
  });

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  useEffect(() => {
    if (!state.ok || !state.saleId) return;

    modal.closeModal();
    router.push(`/sales/${state.saleId}`);
  }, [modal, router, state.ok, state.saleId]);

  function handleContactSelected(contact: ContactOption) {
    setTitleValue((current) =>
      current.trim() ? current : `${contact.name} enquiry`,
    );
    if (contact.leadSource) {
      setLeadSourceValue((current) => current || contact.leadSource || "");
    }
  }

  return (
    <>
      {hideTrigger ? null : (
        <Button size="sm" onClick={modal.openModal} startIcon={<PlusIcon />}>
          {triggerLabel}
        </Button>
      )}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[860px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div className="pr-10">
          <h2 className="mb-1 text-title-xs font-semibold text-gray-800 dark:text-white/90">
            {resolvedModalTitle}
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            {resolvedModalDescription}
          </p>
        </div>

        <form action={formAction} className="space-y-5">
          {linkedContact ? (
            <>
              <input type="hidden" name="contactId" value={linkedContact.id} />
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-800 dark:bg-white/[0.03]">
                <span className="font-medium text-gray-800 dark:text-white/90">
                  {linkedContact.name}
                </span>
                {linkedContact.companyName ? (
                  <span className="ml-2 text-gray-500 dark:text-gray-400">
                    {linkedContact.companyName}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {!linkedContact && (contacts.length || requireLinkedContact) ? (
              <SaleContactPicker
                companies={companies}
                companiesEnabled={companiesEnabled}
                contacts={contacts}
                onContactSelected={handleContactSelected}
                requireLinkedContact={requireLinkedContact}
              />
            ) : null}

            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Sale name
              </span>
              <input
                name="title"
                required
                value={titleValue}
                onChange={(event) => setTitleValue(event.target.value)}
                className={inputClassName}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Value
              </span>
              <input
                name="valuePounds"
                inputMode="decimal"
                placeholder="0"
                className={inputClassName}
              />
            </label>

            <input type="hidden" name="stage" value="LEAD" />

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Pipeline stage
              </span>
              <select
                name="salesPipelineStageId"
                defaultValue={defaultPipelineStageId}
                className={inputClassName}
              >
                {stages.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Owner
              </span>
              <select
                name="ownerId"
                defaultValue={defaultOwnerId ?? "unassigned"}
                className={inputClassName}
              >
                <option value="unassigned">Unassigned</option>
                {owners.map((owner) => (
                  <option key={owner.value} value={owner.value}>
                    {owner.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Expected close
              </span>
              <input name="expectedCloseDate" type="date" className={inputClassName} />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Lead source
              </span>
              <select
                name="source"
                value={leadSourceValue}
                onChange={(event) => setLeadSourceValue(event.target.value)}
                required
                className={inputClassName}
              >
                <option value="" disabled>
                  Select source
                </option>
                {leadSourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Next step
              </span>
              <textarea name="nextStep" className={textareaClassName} />
            </label>
          </div>

          <ActionStateMessage state={state.message && !state.ok ? state : undefined} />

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={modal.closeModal}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Adding..." : resolvedSubmitLabel}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
