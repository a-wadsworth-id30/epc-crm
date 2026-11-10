"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  linkContactToCompanyAction,
  unlinkContactFromCompanyAction,
  type CompanyActionState,
} from "@/lib/actions/companies";

type ContactSearchResult = {
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
      setResults((data.contacts ?? []).filter((contact) => contact.companyId !== companyId));
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
            const moving = Boolean(contact.companyId);
            return (
              <div key={contact.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 dark:text-white/90">{contact.displayName || "Unnamed person"}</p>
                  <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{[contact.role, contact.email, contact.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{moving ? `Currently linked to ${contact.companyName ?? "another company"}` : "Not linked to a company"}</p>
                </div>
                <form action={action}>
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="expectedCurrentCompanyId" value={contact.companyId ?? ""} />
                  <input type="hidden" name="allowMove" value={moving ? "true" : "false"} />
                  <button type="submit" disabled={isPending} className={moving ? secondaryButton : "inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"}>{moving ? "Move to this company" : "Link person"}</button>
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
