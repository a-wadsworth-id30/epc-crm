"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  linkContactToCompanyAction,
  makeCompanyContactPrimaryAction,
  unlinkContactFromCompanyAction,
  updateCompanyContactResponsibilitiesAction,
  type CompanyActionState,
} from "@/lib/actions/companies";
import {
  companyContactResponsibilityOptions,
  type CompanyContactResponsibilityValue,
} from "@/lib/companies/contact-responsibilities";

type ContactSearchResult = {
  companyIds: string[];
  companyId: string | null;
  companyName: string | null;
  displayName: string;
  email: string | null;
  id: string;
  phone: string | null;
  role: string | null;
};

const initialState: CompanyActionState = { ok: false, message: "" };
const secondaryButton = "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

export function CompanyContactLinker({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [state, action, isPending] = useActionState(linkContactToCompanyAction, initialState);

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message, state.ok ? "success" : "error");
    if (state.ok) {
      setResults([]);
      router.refresh();
    }
  }, [router, showToast, state]);

  async function search(formData: FormData) {
    const query = String(formData.get("query") ?? "").trim();
    if (query.length < 2) {
      setSearchError("Enter at least two characters.");
      setResults([]);
      return;
    }
    setIsSearching(true);
    setSearchError("");
    try {
      const response = await fetch(`/api/contacts?query=${encodeURIComponent(query)}&limit=20`);
      if (!response.ok) throw new Error("search-failed");
      const data = (await response.json()) as { contacts?: ContactSearchResult[] };
      setResults(
        (data.contacts ?? []).filter(
          (contact) => !contact.companyIds.includes(companyId),
        ),
      );
    } catch {
      setSearchError("People could not be searched. Try again.");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  if (!isOpen) {
    return <button type="button" onClick={() => setIsOpen(true)} className={secondaryButton}>Link existing person</button>;
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form action={search} className="flex min-w-0 flex-1 gap-2">
          <label className="sr-only" htmlFor="company-contact-search">Search people</label>
          <input id="company-contact-search" name="query" type="search" placeholder="Search by name, email or phone" className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
          <button type="submit" disabled={isSearching} className="h-10 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{isSearching ? "Searching..." : "Search"}</button>
        </form>
        <button type="button" onClick={() => { setIsOpen(false); setResults([]); setSearchError(""); }} className={secondaryButton}>Close</button>
      </div>
      {searchError ? <p className="mt-2 text-sm text-error-600">{searchError}</p> : null}
      {results.length ? (
        <div className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {results.map((contact) => {
            const hasPrimaryCompany = Boolean(contact.companyId);
            return (
              <div key={contact.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 dark:text-white/90">{contact.displayName || "Unnamed person"}</p>
                  <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{[contact.role, contact.email, contact.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {hasPrimaryCompany
                      ? `Primary Company: ${contact.companyName ?? "another company"}`
                      : "No primary Company"}
                  </p>
                </div>
                <form action={action}>
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="contactId" value={contact.id} />
                  <button type="submit" disabled={isPending} className={hasPrimaryCompany ? secondaryButton : "inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"}>
                    {hasPrimaryCompany ? "Link as additional" : "Link person"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="mt-2"><ActionStateMessage state={state.message ? state : undefined} /></div>
    </div>
  );
}

export function CompanyContactPrimaryButton({
  companyId,
  contactId,
}: {
  companyId: string;
  contactId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [state, action, isPending] = useActionState(
    makeCompanyContactPrimaryAction,
    initialState,
  );

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message, state.ok ? "success" : "error");
    if (state.ok) router.refresh();
  }, [router, showToast, state]);

  return (
    <form action={action}>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="contactId" value={contactId} />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-60 dark:text-brand-400"
      >
        {isPending ? "Updating..." : "Make primary"}
      </button>
    </form>
  );
}

export function CompanyContactUnlinkButton({ companyId, contactId, contactName }: { companyId: string; contactId: string; contactName: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [state, action, isPending] = useActionState(unlinkContactFromCompanyAction, initialState);

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message, state.ok ? "success" : "error");
    if (state.ok) {
      router.refresh();
    }
  }, [router, showToast, state]);

  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} className="text-xs font-semibold text-gray-500 hover:text-error-600 dark:text-gray-400">Unlink</button>;
  }

  return (
    <form action={action} className="mt-2 rounded-lg border border-warning-200 bg-warning-50 p-2 text-left dark:border-warning-900/50 dark:bg-warning-900/10">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="contactId" value={contactId} />
      <p className="text-xs text-gray-700 dark:text-gray-300">Unlink {contactName}? Their person record will be kept.</p>
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={isPending} className="h-8 rounded-lg bg-error-500 px-2 text-xs font-semibold text-white hover:bg-error-600 disabled:opacity-60">{isPending ? "Unlinking..." : "Confirm unlink"}</button>
        <button type="button" onClick={() => setConfirming(false)} className="h-8 rounded-lg border border-gray-300 px-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300">Cancel</button>
      </div>
    </form>
  );
}

export function CompanyContactResponsibilitiesEditor({
  companyId,
  contactId,
  responsibilities,
}: {
  companyId: string;
  contactId: string;
  responsibilities: CompanyContactResponsibilityValue[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [state, action, isPending] = useActionState(
    updateCompanyContactResponsibilitiesAction,
    initialState,
  );

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message, state.ok ? "success" : "error");
    if (state.ok) {
      router.refresh();
    }
  }, [router, showToast, state]);

  const selected = new Set(responsibilities);
  const labels = companyContactResponsibilityOptions
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);

  if (!isOpen) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {labels.length ? (
          labels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
            >
              {label}
            </span>
          ))
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            No Company contact roles
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="ml-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          Manage roles
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="contactId" value={contactId} />
      <fieldset>
        <legend className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Company contact roles
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {companyContactResponsibilityOptions.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
            >
              <input
                type="checkbox"
                name="responsibilities"
                value={option.value}
                defaultChecked={selected.has(option.value)}
                className="mt-0.5 size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <span>
                <span className="block text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-gray-500 dark:text-gray-400">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save roles"}
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="h-8 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300"
        >
          Cancel
        </button>
      </div>
      <ActionStateMessage state={state.message ? state : undefined} />
    </form>
  );
}
