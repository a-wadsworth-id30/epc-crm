"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { GitMerge } from "lucide-react";
import CompanyForm, {
  type CompanyFormValues,
} from "@/components/crm-boilerplate/CompanyForm";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { EditIcon, PlusIcon, TrashBinIcon } from "@/icons";
import {
  deleteCompanyAction,
  mergeCompaniesAction,
  type CompanyMergeActionState,
} from "@/lib/actions/companies";
import type { CompanyCustomFieldDefinition } from "@/lib/companies/custom-fields";
import type { CompanyTypeOption } from "@/lib/companies/company-types";
import type { CompanyOwnerOption } from "@/lib/companies/owner-assignment";

export type CompanyCreateModalProps = {
  addressLookupEnabled?: boolean;
  autoOpen?: boolean;
  companyTypes: CompanyTypeOption[];
  customFields: CompanyCustomFieldDefinition[];
  hideTrigger?: boolean;
  ownerOptions: CompanyOwnerOption[];
};

export type CompanyEditModalProps = {
  addressLookupEnabled?: boolean;
  autoOpen?: boolean;
  company: CompanyFormValues;
  companyTypes: CompanyTypeOption[];
  customFields: CompanyCustomFieldDefinition[];
  ownerOptions: CompanyOwnerOption[];
};

export type CompanyDeleteModalProps = {
  autoOpen?: boolean;
  companyId: string;
  companyName: string;
  relatedRecords: {
    contacts: number;
    notes: number;
    opportunities: number;
    tasks: number;
  };
};

export type CompanyMergeCandidate = {
  companyType: string;
  domain: string | null;
  id: string;
  name: string;
  relatedCount: number;
  status: string;
};

export type CompanyMergeModalProps = {
  autoOpen?: boolean;
  candidates: CompanyMergeCandidate[];
  companyId: string;
  companyName: string;
};

const companyTextButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

export function CompanyCreateModal({
  addressLookupEnabled = false,
  autoOpen,
  companyTypes,
  customFields,
  hideTrigger = false,
  ownerOptions,
}: CompanyCreateModalProps) {
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
          Add company
        </Button>
      )}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[820px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Add company
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Create an account-level company for contacts, tasks and sales
            activity.
          </p>
          <CompanyForm
            mode="create"
            companyTypes={companyTypes}
            customFields={customFields}
            ownerOptions={ownerOptions}
            addressLookupEnabled={addressLookupEnabled}
            onSuccess={modal.closeModal}
          />
        </div>
      </Modal>
    </>
  );
}

export function CompanyEditModal({
  addressLookupEnabled = false,
  autoOpen,
  company,
  companyTypes,
  customFields,
  ownerOptions,
}: CompanyEditModalProps) {
  const modal = useModal();
  const { openModal } = modal;

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  return (
    <>
      <button
        type="button"
        onClick={modal.openModal}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
        aria-label={`Edit ${company.name ?? "company"}`}
      >
        <EditIcon />
      </button>
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[640px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Edit company
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Update company profile details used across contacts and sales
            records.
          </p>
          <CompanyForm
            mode="edit"
            company={company}
            companyTypes={companyTypes}
            customFields={customFields}
            ownerOptions={ownerOptions}
            addressLookupEnabled={addressLookupEnabled}
            onSuccess={modal.closeModal}
          />
        </div>
      </Modal>
    </>
  );
}

export function CompanyDeleteModal({
  autoOpen,
  companyId,
  companyName,
  relatedRecords,
}: CompanyDeleteModalProps) {
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
      <button
        type="button"
        onClick={modal.openModal}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-error-300 text-error-600 hover:bg-error-50 dark:border-error-800 dark:hover:bg-error-900/20"
        aria-label={`Delete ${companyName}`}
      >
        <TrashBinIcon />
      </button>
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[520px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        <div>
          <h2 className="text-title-xs mb-2 font-semibold text-gray-800 dark:text-white/90">
            Delete company
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Remove {companyName} from the CRM? Related contacts, tasks and sales
            will be unlinked. Company notes will be deleted. This cannot be
            undone.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-white/[0.03]">
            <CompanyImpact label="Contacts" value={relatedRecords.contacts} />
            <CompanyImpact label="Tasks" value={relatedRecords.tasks} />
            <CompanyImpact label="Sales" value={relatedRecords.opportunities} />
            <CompanyImpact label="Notes" value={relatedRecords.notes} />
          </dl>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={modal.closeModal}
            >
              Cancel
            </Button>
            <form
              action={async (formData) => {
                setIsSubmitting(true);
                try {
                  await deleteCompanyAction(formData);
                  modal.closeModal();
                  showToast("Company deleted.");
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              <input type="hidden" name="id" value={companyId} />
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-lg bg-error-500 px-5 py-3.5 text-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Deleting..." : "Delete company"}
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function CompanyMergeModal({
  autoOpen,
  candidates,
  companyId,
  companyName,
}: CompanyMergeModalProps) {
  const modal = useModal();
  const { openModal } = modal;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState<
    CompanyMergeActionState,
    FormData
  >(mergeCompaniesAction, { ok: false, message: "" });

  useEffect(() => {
    if (autoOpen) openModal();
  }, [autoOpen, openModal]);

  useEffect(() => {
    if (!state.ok) return;
    showToast(state.message || "Companies merged.");
    modal.closeModal();
  }, [modal, showToast, state.message, state.ok]);

  const filteredCandidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return candidates
      .filter((candidate) =>
        term
          ? [
              candidate.name,
              candidate.domain,
              candidate.companyType,
              candidate.status,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true,
      )
      .slice(0, 50);
  }, [candidates, query]);
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedId) ?? null;

  return (
    <>
      <button
        type="button"
        onClick={modal.openModal}
        className={companyTextButtonClassName}
      >
        <GitMerge className="size-4" />
        Merge
      </button>
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[680px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Merge duplicate company
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Keep {companyName} and move the selected company&apos;s linked
            People, sales, tasks, notes, documents and integrations into this
            record. The selected duplicate will then be permanently removed.
          </p>
        </div>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="primaryCompanyId" value={companyId} />
          <input type="hidden" name="duplicateCompanyId" value={selectedId} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Find duplicate company
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, domain, type or status"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 transition outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </label>

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-white/[0.03]">
            {filteredCandidates.length ? (
              filteredCandidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                    selectedId === candidate.id
                      ? "border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20"
                      : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="candidate"
                    value={candidate.id}
                    checked={selectedId === candidate.id}
                    onChange={() => setSelectedId(candidate.id)}
                    className="mt-1 h-4 w-4 border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-gray-800 dark:text-white/90">
                      {candidate.name}
                    </span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {[
                        candidate.domain,
                        candidate.companyType,
                        candidate.status,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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
                No matching companies found.
              </p>
            )}
          </div>

          {state.message && !state.ok ? (
            <p className="text-sm text-error-600 dark:text-error-400">
              {state.message}
            </p>
          ) : null}
          {selectedCandidate ? (
            <p className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/10 dark:text-warning-200">
              {selectedCandidate.name} will be permanently removed after its
              linked records are moved to {companyName}.
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={modal.closeModal}
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={!selectedCandidate || isPending}
              className="inline-flex items-center justify-center rounded-lg bg-error-500 px-5 py-3 text-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Merging..." : "Merge duplicate"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function CompanyImpact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-gray-800 dark:text-white/90">
        {value}
      </dd>
    </div>
  );
}
