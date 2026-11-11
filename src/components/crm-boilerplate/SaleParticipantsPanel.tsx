"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  addSaleParticipantAction,
  removeSaleParticipantAction,
  updateSaleParticipantRoleAction,
  type SaleParticipantActionState,
} from "@/lib/actions/sale-participants";
import {
  salesParticipantRoleLabel,
  salesParticipantRoleOptions,
} from "@/lib/sales/participants";

type ParticipantRole = (typeof salesParticipantRoleOptions)[number]["value"];

type SaleParticipant = {
  companyName: string | null;
  contactRole: string | null;
  email: string | null;
  id: string;
  name: string;
  personId: string;
  role: ParticipantRole;
};

type ContactSearchResult = {
  companyName: string | null;
  displayName: string;
  email: string | null;
  id: string;
  phone: string | null;
  role: string | null;
};

const initialState: SaleParticipantActionState = { message: "", ok: false };
const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

function useParticipantActionFeedback(state: SaleParticipantActionState) {
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message, state.ok ? "success" : "error");
    if (state.ok) router.refresh();
  }, [router, showToast, state]);
}

function ParticipantRow({
  participant,
  saleId,
}: {
  participant: SaleParticipant;
  saleId: string;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [updateState, updateAction, isUpdating] = useActionState(
    updateSaleParticipantRoleAction,
    initialState,
  );
  const [removeState, removeAction, isRemoving] = useActionState(
    removeSaleParticipantAction,
    initialState,
  );
  useParticipantActionFeedback(updateState);
  useParticipantActionFeedback(removeState);
  const isPrimary = participant.role === "PRIMARY_CUSTOMER";

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/contacts/${participant.personId}`}
              className="font-semibold text-gray-800 hover:text-brand-600 hover:underline dark:text-white/90 dark:hover:text-brand-300"
            >
              {participant.name || "Unnamed person"}
            </Link>
            {isPrimary ? (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                Primary
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
            {[participant.contactRole, participant.companyName, participant.email]
              .filter(Boolean)
              .join(" · ") || "No additional contact details"}
          </p>
        </div>

        <form action={updateAction} className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="participantId" value={participant.id} />
          <input type="hidden" name="saleId" value={saleId} />
          <label className="sr-only" htmlFor={`participant-role-${participant.id}`}>
            Role for {participant.name}
          </label>
          <select
            id={`participant-role-${participant.id}`}
            name="role"
            defaultValue={participant.role}
            className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {salesParticipantRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={isUpdating} className={secondaryButton}>
            {isUpdating ? "Saving..." : "Save role"}
          </button>
        </form>

        {isPrimary ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This person is the Sale&apos;s reply, call and primary customer contact.
          </p>
        ) : confirmingRemove ? (
          <form
            action={removeAction}
            className="rounded-lg border border-warning-200 bg-warning-50 p-2 dark:border-warning-900/50 dark:bg-warning-900/10"
          >
            <input type="hidden" name="participantId" value={participant.id} />
            <input type="hidden" name="saleId" value={saleId} />
            <p className="text-xs text-gray-700 dark:text-gray-300">
              Remove {participant.name} from this Sale? Their Person record is kept.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="submit"
                disabled={isRemoving}
                className="h-8 rounded-lg bg-error-500 px-2.5 text-xs font-semibold text-white hover:bg-error-600 disabled:opacity-60"
              >
                {isRemoving ? "Removing..." : "Confirm remove"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                className="h-8 rounded-lg border border-gray-300 px-2.5 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="w-fit text-xs font-semibold text-gray-500 hover:text-error-600 dark:text-gray-400"
          >
            Remove from Sale
          </button>
        )}
      </div>
      <ActionStateMessage
        state={updateState.message ? updateState : removeState.message ? removeState : undefined}
      />
    </li>
  );
}

export default function SaleParticipantsPanel({
  participants,
  saleId,
}: {
  participants: SaleParticipant[];
  saleId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [state, action, isPending] = useActionState(
    addSaleParticipantAction,
    initialState,
  );
  const participantIds = useMemo(
    () => new Set(participants.map((participant) => participant.personId)),
    [participants],
  );

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message, state.ok ? "success" : "error");
    if (state.ok) {
      setResults([]);
      setIsAdding(false);
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
      const response = await fetch(
        `/api/contacts?query=${encodeURIComponent(query)}&limit=20`,
      );
      if (!response.ok) throw new Error("search-failed");
      const data = (await response.json()) as {
        contacts?: ContactSearchResult[];
      };
      setResults(
        (data.contacts ?? []).filter((contact) => !participantIds.has(contact.id)),
      );
    } catch {
      setSearchError("People could not be searched. Try again.");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            People on this Sale
          </h2>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Keep one primary customer and add everyone else involved with a clear role.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdding((value) => !value)}
          className={secondaryButton}
          aria-expanded={isAdding}
        >
          {isAdding ? "Close" : "Add person"}
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {participants.map((participant) => (
          <ParticipantRow
            key={participant.id}
            participant={participant}
            saleId={saleId}
          />
        ))}
      </ul>

      {!participants.length ? (
        <p className="mt-4 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700 dark:bg-warning-900/10 dark:text-warning-300">
          No people are linked. Add a primary customer before sending replies or making calls.
        </p>
      ) : null}

      {isAdding ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
          <form action={search} className="flex min-w-0 gap-2">
            <label className="sr-only" htmlFor={`sale-participant-search-${saleId}`}>
              Search people
            </label>
            <input
              id={`sale-participant-search-${saleId}`}
              name="query"
              type="search"
              placeholder="Search by name, email or phone"
              className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="h-10 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </form>
          {searchError ? (
            <p className="mt-2 text-sm text-error-600">{searchError}</p>
          ) : null}

          {results.length ? (
            <div className="mt-3 space-y-2">
              {results.map((contact) => (
                <form
                  key={contact.id}
                  action={action}
                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                >
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="saleId" value={saleId} />
                  <p className="font-semibold text-gray-800 dark:text-white/90">
                    {contact.displayName || "Unnamed person"}
                  </p>
                  <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                    {[contact.role, contact.companyName, contact.email, contact.phone]
                      .filter(Boolean)
                      .join(" · ") || "No contact details"}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <label className="sr-only" htmlFor={`new-participant-role-${contact.id}`}>
                      Role for {contact.displayName}
                    </label>
                    <select
                      id={`new-participant-role-${contact.id}`}
                      name="role"
                      defaultValue="JOINT_APPLICANT"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                    >
                      {salesParticipantRoleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="h-9 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                    >
                      {isPending ? "Adding..." : "Add to Sale"}
                    </button>
                  </div>
                </form>
              ))}
            </div>
          ) : null}
          {!isSearching && !searchError && !results.length ? (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Search for an existing Person to link to this Sale.
            </p>
          ) : null}
          <ActionStateMessage state={state.message ? state : undefined} />
        </div>
      ) : null}

      <p className="sr-only">
        {participants.map((participant) => salesParticipantRoleLabel(participant.role)).join(", ")}
      </p>
    </section>
  );
}
