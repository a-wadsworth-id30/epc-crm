"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import AddressLookupControl from "@/components/crm-boilerplate/AddressLookupControl";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import ContactMethodsEditor from "@/components/crm-boilerplate/ContactMethodsEditor";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import ContactTagInput, {
  type ContactTagOption,
} from "@/components/crm-boilerplate/ContactTagInput";
import SearchableCompanySelect from "@/components/crm-boilerplate/SearchableCompanySelect";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  createContactAction,
  updateContactAction,
  type ContactActionState,
} from "@/lib/actions/contacts";
import type {
  ContactEmailMethod,
  ContactPhoneMethod,
} from "@/lib/contact-methods";
import {
  contactCategoryOption,
  contactCategoryOptions,
  defaultContactCategory,
  type ContactCategoryValue,
} from "@/lib/contacts/categories";
import { leadSourceOptions } from "@/lib/sales/lead-sources";

type CompanyOption = {
  id: string;
  name: string;
};

export type ContactFormValues = {
  id?: string;
  category?: ContactCategoryValue | null;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  additionalEmails?: ContactEmailMethod[];
  additionalPhones?: ContactPhoneMethod[];
  leadSource?: string | null;
  role?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
  country?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  tags?: ContactTagOption[];
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

export default function ContactForm({
  mode,
  contact,
  companies,
  companiesEnabled,
  availableTags,
  addressLookupEnabled = false,
  onSuccess,
}: {
  mode: "create" | "edit";
  contact?: ContactFormValues;
  companies: CompanyOption[];
  companiesEnabled: boolean;
  availableTags: ContactTagOption[];
  addressLookupEnabled?: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [tagResetSignal, setTagResetSignal] = useState(0);
  const [methodResetSignal, setMethodResetSignal] = useState(0);
  const [selectedCategory, setSelectedCategory] =
    useState<ContactCategoryValue>(contact?.category ?? defaultContactCategory);
  const { showToast } = useToast();
  const action = mode === "create" ? createContactAction : updateContactAction;
  const [state, formAction, isPending] = useActionState<
    ContactActionState,
    FormData
  >(action, {
    ok: false,
    message: "",
  });

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

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    if (mode === "create") {
      formRef.current?.reset();
    }
    showToast(
      state.message ||
        (mode === "create" ? "Person created." : "Person updated."),
    );
    queueMicrotask(() => {
      if (mode === "create") {
        setTagResetSignal((current) => current + 1);
        setMethodResetSignal((current) => current + 1);
        setSelectedCategory(defaultContactCategory);
      }
      setIsDirty(false);
      onSuccess?.();
      if (mode === "create" && state.contactId) {
        router.push(`/contacts/${state.contactId}`);
      }
    });
  }, [
    mode,
    onSuccess,
    router,
    showToast,
    state.contactId,
    state.message,
    state.ok,
  ]);

  return (
    <form ref={formRef} action={formAction} onChangeCapture={handleFormChange}>
      {contact?.id && <input type="hidden" name="id" value={contact.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor={`${mode}-contact-category`}>Person type</Label>
          <select
            id={`${mode}-contact-category`}
            name="category"
            value={selectedCategory}
            onChange={(event) =>
              setSelectedCategory(event.target.value as ContactCategoryValue)
            }
            className={selectClassName}
          >
            {contactCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {contactCategoryOption(selectedCategory).description}
          </p>
        </div>
        <div>
          <Label htmlFor={`${mode}-contact-first-name`}>
            {selectedCategory === "COMPANY"
              ? "Organisation name"
              : "First name"}
          </Label>
          <Input
            id={`${mode}-contact-first-name`}
            name="firstName"
            defaultValue={contact?.firstName ?? ""}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-contact-last-name`}>
            {selectedCategory === "COMPANY"
              ? "Primary contact / descriptor"
              : "Last name"}
          </Label>
          <Input
            id={`${mode}-contact-last-name`}
            name="lastName"
            defaultValue={contact?.lastName ?? ""}
            required={selectedCategory !== "COMPANY"}
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-contact-email`}>Primary email</Label>
          <Input
            id={`${mode}-contact-email`}
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-contact-phone`}>Primary phone</Label>
          <Input
            id={`${mode}-contact-phone`}
            name="phone"
            type="tel"
            defaultValue={contact?.phone ?? ""}
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-contact-company`}>Company</Label>
          {companiesEnabled ? (
            <SearchableCompanySelect
              allowCreate
              id={`${mode}-contact-company`}
              companies={companies}
              defaultCompanyId={contact?.companyId}
              defaultCompanyName={contact?.companyName}
              onDirty={() => setIsDirty(true)}
            />
          ) : (
            <Input
              id={`${mode}-contact-company`}
              name="companyName"
              defaultValue={contact?.companyName ?? ""}
              placeholder="Optional company name"
            />
          )}
        </div>
        <div>
          <Label htmlFor={`${mode}-contact-role`}>Role / job title</Label>
          <Input
            id={`${mode}-contact-role`}
            name="role"
            defaultValue={contact?.role ?? ""}
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor={`${mode}-contact-lead-source`}>
            Where did you hear about us?
          </Label>
          <select
            id={`${mode}-contact-lead-source`}
            name="leadSource"
            defaultValue={contact?.leadSource ?? ""}
            required={mode === "create"}
            className={selectClassName}
          >
            <option value="" disabled={mode === "create"}>
              Select source
            </option>
            {leadSourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <ContactTagInput
          key={`${contact?.id ?? "new"}-${tagResetSignal}`}
          id={`${mode}-contact-tags`}
          availableTags={availableTags}
          defaultTags={contact?.tags?.map((tag) => tag.name)}
          onDirty={() => setIsDirty(true)}
        />
      </div>
      <ContactMethodsEditor
        key={`${contact?.id ?? "new"}-${methodResetSignal}`}
        id={`${mode}-contact-methods`}
        defaultEmails={contact?.additionalEmails}
        defaultPhones={contact?.additionalPhones}
        onDirty={() => setIsDirty(true)}
      />
      <div className="mt-6 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          Address
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <AddressLookupControl
            enabled={addressLookupEnabled}
            id={`${mode}-contact-address-lookup`}
            onDirty={() => setIsDirty(true)}
          />
          <div className="md:col-span-2">
            <Label htmlFor={`${mode}-contact-address-line-1`}>
              Address line 1
            </Label>
            <Input
              id={`${mode}-contact-address-line-1`}
              name="addressLine1"
              defaultValue={contact?.addressLine1 ?? ""}
              placeholder="Building and street"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor={`${mode}-contact-address-line-2`}>
              Address line 2
            </Label>
            <Input
              id={`${mode}-contact-address-line-2`}
              name="addressLine2"
              defaultValue={contact?.addressLine2 ?? ""}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label htmlFor={`${mode}-contact-city`}>City</Label>
            <Input
              id={`${mode}-contact-city`}
              name="city"
              defaultValue={contact?.city ?? ""}
            />
          </div>
          <div>
            <Label htmlFor={`${mode}-contact-county`}>County</Label>
            <Input
              id={`${mode}-contact-county`}
              name="county"
              defaultValue={contact?.county ?? ""}
            />
          </div>
          <div>
            <Label htmlFor={`${mode}-contact-postcode`}>Postcode</Label>
            <Input
              id={`${mode}-contact-postcode`}
              name="postcode"
              defaultValue={contact?.postcode ?? ""}
            />
          </div>
          <div>
            <Label htmlFor={`${mode}-contact-country`}>Country</Label>
            <Input
              id={`${mode}-contact-country`}
              name="country"
              defaultValue={contact?.country ?? ""}
              placeholder="United Kingdom"
            />
          </div>
        </div>
      </div>
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
              ? "Create person"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}
