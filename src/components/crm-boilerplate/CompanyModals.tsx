"use client";

import { useEffect, useState } from "react";
import CompanyForm, {
  type CompanyFormValues,
} from "@/components/crm-boilerplate/CompanyForm";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { EditIcon, PlusIcon, TrashBinIcon } from "@/icons";
import { deleteCompanyAction } from "@/lib/actions/companies";

export type CompanyCreateModalProps = {
  addressLookupEnabled?: boolean;
  autoOpen?: boolean;
  hideTrigger?: boolean;
};

export type CompanyEditModalProps = {
  addressLookupEnabled?: boolean;
  autoOpen?: boolean;
  company: CompanyFormValues;
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

export function CompanyCreateModal({
  addressLookupEnabled = false,
  autoOpen,
  hideTrigger = false,
}: CompanyCreateModalProps = {}) {
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
        className="relative m-5 w-full max-w-[820px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Add company
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Create an account-level company for contacts, tasks and sales activity.
          </p>
          <CompanyForm
            mode="create"
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
        className="relative m-5 w-full max-w-[640px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Edit company
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Update company profile details used across contacts and sales records.
          </p>
          <CompanyForm
            mode="edit"
            company={company}
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
        className="relative m-5 w-full max-w-[520px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <h2 className="text-title-xs mb-2 font-semibold text-gray-800 dark:text-white/90">
            Delete company
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Remove {companyName} from the CRM? Related contacts, tasks and sales
            will be unlinked. Company notes will be deleted. This cannot be undone.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-white/[0.03]">
            <CompanyImpact label="Contacts" value={relatedRecords.contacts} />
            <CompanyImpact label="Tasks" value={relatedRecords.tasks} />
            <CompanyImpact label="Sales" value={relatedRecords.opportunities} />
            <CompanyImpact label="Notes" value={relatedRecords.notes} />
          </dl>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={modal.closeModal}>
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

function CompanyImpact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}
