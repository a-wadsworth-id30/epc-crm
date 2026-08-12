"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import AddressLookupControl from "@/components/crm-boilerplate/AddressLookupControl";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { PlusIcon, TrashBinIcon } from "@/icons";
import {
  createCompanyAction,
  updateCompanyAction,
  type CompanyActionState,
} from "@/lib/actions/companies";
import { leadSourceOptions } from "@/lib/sales/lead-sources";

export type CompanyFormValues = {
  id?: string;
  name?: string;
  domain?: string | null;
  status?: string | null;
  owner?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
  country?: string | null;
};

const companyStatuses = ["Prospect", "Active", "Inactive"] as const;
const maxCompanyCreateContacts = 10;

type ContactDraft = {
  id: string;
};

export default function CompanyForm({
  company,
  mode,
  addressLookupEnabled = false,
  onSuccess,
}: {
  company?: CompanyFormValues;
  mode: "create" | "edit";
  addressLookupEnabled?: boolean;
  onSuccess?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [contactDrafts, setContactDrafts] = useState<ContactDraft[]>([]);
  const contactDraftCounter = useRef(0);
  const { showToast } = useToast();
  const action = mode === "create" ? createCompanyAction : updateCompanyAction;
  const [state, formAction, isPending] = useActionState<
    CompanyActionState,
    FormData
  >(action, {
    ok: false,
    message: "",
  });
  const defaultStatuses = [...companyStatuses] as string[];
  const statusOptions =
    company?.status && !defaultStatuses.includes(company.status)
      ? [company.status, ...defaultStatuses]
      : defaultStatuses;

  useEffect(() => {
    if (!state.ok) return;

    showToast(
      state.message ||
        (mode === "create" ? "Company created." : "Company updated."),
    );
    queueMicrotask(() => {
      if (mode === "create") {
        formRef.current?.reset();
        setContactDrafts([]);
      }
      setIsDirty(false);
      onSuccess?.();
    });
  }, [mode, onSuccess, showToast, state.message, state.ok]);

  function addContactDraft() {
    setIsDirty(true);
    setContactDrafts((drafts) => {
      if (drafts.length >= maxCompanyCreateContacts) {
        return drafts;
      }

      contactDraftCounter.current += 1;
      return [...drafts, { id: `contact-${contactDraftCounter.current}` }];
    });
  }

  function removeContactDraft(contactId: string) {
    setIsDirty(true);
    setContactDrafts((drafts) =>
      drafts.filter((draft) => draft.id !== contactId),
    );
  }

  function handleFormChange(event: ChangeEvent<HTMLFormElement>) {
    const target = event.target;

    if (
      target instanceof HTMLInputElement &&
      target.dataset.addressLookup === "true"
    ) {
      return;
    }

    setIsDirty(true);
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onChangeCapture={handleFormChange}
    >
      {company?.id ? (
        <input type="hidden" name="id" value={company.id} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor={`${mode}-company-name`}>Company name</Label>
          <Input
            id={`${mode}-company-name`}
            name="name"
            defaultValue={company?.name ?? ""}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-company-domain`}>Domain</Label>
          <Input
            id={`${mode}-company-domain`}
            name="domain"
            defaultValue={company?.domain ?? ""}
            placeholder="example.com"
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-company-owner`}>Owner</Label>
          <Input
            id={`${mode}-company-owner`}
            name="owner"
            defaultValue={company?.owner ?? ""}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-company-status`}>Status</Label>
          <select
            id={`${mode}-company-status`}
            name="status"
            defaultValue={company?.status ?? "Prospect"}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <AddressLookupControl
          enabled={addressLookupEnabled}
          id={`${mode}-company-address-lookup`}
          onDirty={() => setIsDirty(true)}
        />
        <div className="md:col-span-2">
          <Label htmlFor={`${mode}-company-address-line-1`}>
            Address line 1
          </Label>
          <Input
            id={`${mode}-company-address-line-1`}
            name="addressLine1"
            defaultValue={company?.addressLine1 ?? ""}
            placeholder="Building and street"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor={`${mode}-company-address-line-2`}>
            Address line 2
          </Label>
          <Input
            id={`${mode}-company-address-line-2`}
            name="addressLine2"
            defaultValue={company?.addressLine2 ?? ""}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-company-city`}>City</Label>
          <Input
            id={`${mode}-company-city`}
            name="city"
            defaultValue={company?.city ?? ""}
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-company-county`}>County</Label>
          <Input
            id={`${mode}-company-county`}
            name="county"
            defaultValue={company?.county ?? ""}
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-company-postcode`}>Postcode</Label>
          <Input
            id={`${mode}-company-postcode`}
            name="postcode"
            defaultValue={company?.postcode ?? ""}
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-company-country`}>Country</Label>
          <Input
            id={`${mode}-company-country`}
            name="country"
            defaultValue={company?.country ?? "United Kingdom"}
          />
        </div>
      </div>
      {mode === "create" ? (
        <section className="mt-6 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Contacts
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Add people at this organisation.
              </p>
            </div>
            <button
              type="button"
              onClick={addContactDraft}
              disabled={contactDrafts.length >= maxCompanyCreateContacts}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <PlusIcon className="size-4" />
              Add contact
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {contactDrafts.length ? (
              contactDrafts.map((contact, index) => (
                <div
                  key={contact.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Contact {index + 1}
                    </h4>
                    <button
                      type="button"
                      onClick={() => removeContactDraft(contact.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-error-300 text-error-600 transition hover:bg-error-50 dark:border-error-800 dark:hover:bg-error-900/20"
                      aria-label={`Remove contact ${index + 1}`}
                    >
                      <TrashBinIcon className="size-4" />
                    </button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor={`${mode}-${contact.id}-first-name`}>
                        First name
                      </Label>
                      <Input
                        id={`${mode}-${contact.id}-first-name`}
                        name="contactFirstName"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${mode}-${contact.id}-last-name`}>
                        Last name
                      </Label>
                      <Input
                        id={`${mode}-${contact.id}-last-name`}
                        name="contactLastName"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${mode}-${contact.id}-role`}>
                        Role / job title
                      </Label>
                      <Input
                        id={`${mode}-${contact.id}-role`}
                        name="contactRole"
                        placeholder="Managing director"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${mode}-${contact.id}-lead-source`}>
                        Where did you hear about us?
                      </Label>
                      <select
                        id={`${mode}-${contact.id}-lead-source`}
                        name="contactLeadSource"
                        required
                        defaultValue=""
                        className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
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
                    </div>
                    <div>
                      <Label htmlFor={`${mode}-${contact.id}-email`}>
                        Email
                      </Label>
                      <Input
                        id={`${mode}-${contact.id}-email`}
                        name="contactEmail"
                        type="email"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${mode}-${contact.id}-phone`}>
                        Phone
                      </Label>
                      <Input
                        id={`${mode}-${contact.id}-phone`}
                        name="contactPhone"
                        type="tel"
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No contacts added.
              </p>
            )}
          </div>
        </section>
      ) : null}
      <div className="mt-5 space-y-4">
        <ActionStateMessage state={state} />
        <button
          type="submit"
          disabled={isPending || !isDirty}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? "Saving..."
            : mode === "create"
              ? "Create company"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}
