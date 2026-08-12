"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { GitMerge } from "lucide-react";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { EditIcon, PlusIcon, TrashBinIcon } from "@/icons";
import { useModal } from "@/hooks/useModal";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import ContactForm, { type ContactFormValues } from "@/components/crm-boilerplate/ContactForm";
import type { ContactTagOption } from "@/components/crm-boilerplate/ContactTagInput";
import {
  deleteContactAction,
  mergeContactsAction,
  type ContactMergeActionState,
} from "@/lib/actions/contacts";

type CompanyOption = {
  id: string;
  name: string;
};

export type ContactCreateModalProps = {
  addressLookupEnabled?: boolean;
  autoOpen?: boolean;
  companies: CompanyOption[];
  companiesEnabled: boolean;
  availableTags: ContactTagOption[];
  hideTrigger?: boolean;
};

export type ContactEditModalProps = {
  addressLookupEnabled?: boolean;
  autoOpen?: boolean;
  contact: ContactFormValues;
  companies: CompanyOption[];
  companiesEnabled: boolean;
  availableTags: ContactTagOption[];
  triggerLabel?: string;
};

export type ContactDeleteModalProps = {
  autoOpen?: boolean;
  contactId: string;
  contactName: string;
  redirectTo?: string;
  triggerLabel?: string;
};

export type ContactMergeCandidate = {
  companyName: string | null;
  email: string | null;
  id: string;
  name: string;
  phone: string | null;
  relatedCount: number;
};

export type ContactMergeModalProps = {
  autoOpen?: boolean;
  candidates: ContactMergeCandidate[];
  contactId: string;
  contactName: string;
  triggerLabel?: string;
};

const textButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

const dangerTextButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-error-300 bg-white px-3 text-sm font-medium text-error-600 transition hover:bg-error-50 dark:border-error-800 dark:bg-gray-900 dark:hover:bg-error-900/20";

const mergeSelectClassName =
  "mt-3 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-white/[0.03]";

export function ContactCreateModal({
  addressLookupEnabled = false,
  autoOpen,
  companies,
  companiesEnabled,
  availableTags,
  hideTrigger = false,
}: ContactCreateModalProps) {
  const modal = useModal();
  const { openModal } = modal;

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  return (
    <>
      {hideTrigger ? null : (
        <Button size="sm" onClick={modal.openModal} startIcon={<PlusIcon />}>
          Add contact
        </Button>
      )}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[760px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Add contact
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Add a person and optionally link them to a client company.
          </p>
          <ContactForm
            mode="create"
            companies={companies}
            companiesEnabled={companiesEnabled}
            availableTags={availableTags}
            addressLookupEnabled={addressLookupEnabled}
            onSuccess={modal.closeModal}
          />
        </div>
      </Modal>
    </>
  );
}

export function ContactEditModal({
  addressLookupEnabled = false,
  autoOpen,
  contact,
  companies,
  companiesEnabled,
  availableTags,
  triggerLabel,
}: ContactEditModalProps) {
  const modal = useModal();
  const { openModal } = modal;

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  return (
    <>
      {triggerLabel ? (
        <button
          type="button"
          onClick={modal.openModal}
          className={textButtonClassName}
        >
          <EditIcon className="size-4" />
          {triggerLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={modal.openModal}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
          aria-label={`Edit ${contact.firstName} ${contact.lastName}`}
        >
          <EditIcon />
        </button>
      )}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[760px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Edit contact
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Update contact details and company assignment.
          </p>
          <ContactForm
            mode="edit"
            contact={contact}
            companies={companies}
            companiesEnabled={companiesEnabled}
            availableTags={availableTags}
            addressLookupEnabled={addressLookupEnabled}
            onSuccess={modal.closeModal}
          />
        </div>
      </Modal>
    </>
  );
}

export function ContactDeleteModal({
  autoOpen,
  contactId,
  contactName,
  redirectTo,
  triggerLabel,
}: ContactDeleteModalProps) {
  const modal = useModal();
  const { openModal } = modal;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  return (
    <>
      {triggerLabel ? (
        <button
          type="button"
          onClick={modal.openModal}
          className={dangerTextButtonClassName}
        >
          <TrashBinIcon className="size-4" />
          {triggerLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={modal.openModal}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-error-300 text-error-600 hover:bg-error-50 dark:border-error-800 dark:hover:bg-error-900/20"
          aria-label={`Delete ${contactName}`}
        >
          <TrashBinIcon />
        </button>
      )}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[460px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <h2 className="text-title-xs mb-2 font-semibold text-gray-800 dark:text-white/90">
            Delete contact
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Remove {contactName} from the CRM? This cannot be undone.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={modal.closeModal}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              Cancel
            </button>
            <form
              action={async (formData) => {
                setIsSubmitting(true);
                await deleteContactAction(formData);
                modal.closeModal();
                showToast("Contact deleted.");
                setIsSubmitting(false);
              }}
            >
              <input type="hidden" name="id" value={contactId} />
              {redirectTo ? (
                <input type="hidden" name="redirectTo" value={redirectTo} />
              ) : null}
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-lg bg-error-500 px-5 py-3.5 text-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Deleting..." : "Delete contact"}
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ContactMergeModal({
  autoOpen,
  candidates,
  contactId,
  contactName,
  triggerLabel = "Merge",
}: ContactMergeModalProps) {
  const modal = useModal();
  const { openModal } = modal;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? "");
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState<
    ContactMergeActionState,
    FormData
  >(mergeContactsAction, {
    ok: false,
    message: "",
  });

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  useEffect(() => {
    if (!state.ok) return;

    showToast(state.message || "Contacts merged.");
    modal.closeModal();
  }, [modal, showToast, state.message, state.ok]);

  const filteredCandidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return candidates.slice(0, 25);

    return candidates
      .filter((candidate) =>
        [
          candidate.name,
          candidate.companyName,
          candidate.email,
          candidate.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 25);
  }, [candidates, query]);

  const currentSelectedId = candidates.some((candidate) => candidate.id === selectedId)
    ? selectedId
    : candidates[0]?.id ?? "";
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === currentSelectedId) ?? null;

  return (
    <>
      <button
        type="button"
        onClick={modal.openModal}
        className={textButtonClassName}
      >
        <GitMerge className="size-4" />
        {triggerLabel}
      </button>
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[640px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Merge contact
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Keep {contactName} and move another contact&apos;s activity into this record.
          </p>
        </div>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="primaryContactId" value={contactId} />
          <input type="hidden" name="duplicateContactId" value={currentSelectedId} />

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Find duplicate contact
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, company, email or phone"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </label>

          <div className={mergeSelectClassName}>
            {filteredCandidates.length ? (
              filteredCandidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                    currentSelectedId === candidate.id
                      ? "border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20"
                      : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="candidate"
                    value={candidate.id}
                    checked={currentSelectedId === candidate.id}
                    onChange={() => setSelectedId(candidate.id)}
                    className="mt-1 h-4 w-4 border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-800 dark:text-white/90">
                      {candidate.name}
                    </span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {[candidate.companyName, candidate.email, candidate.phone]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"}
                    </span>
                    <span className="mt-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      {candidate.relatedCount} linked record
                      {candidate.relatedCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </label>
              ))
            ) : (
              <p className="p-3 text-sm text-gray-500 dark:text-gray-400">
                No matching contacts found.
              </p>
            )}
          </div>

          {selectedCandidate ? (
            <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
              {selectedCandidate.name} will be removed after its leads,
              conversations, calls, notes, tasks, files, attribution records and
              tags are moved into {contactName}.
            </div>
          ) : null}

          {state.message ? (
            <p
              className={`text-sm ${
                state.ok
                  ? "text-success-600 dark:text-success-400"
                  : "text-error-600 dark:text-error-400"
              }`}
            >
              {state.message}
            </p>
          ) : null}

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
              disabled={isPending || !currentSelectedId}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Merging..." : "Merge contact"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
