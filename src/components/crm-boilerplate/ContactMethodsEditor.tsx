"use client";

import { useMemo, useState } from "react";
import { Mail, Phone, Plus, Trash2 } from "lucide-react";
import Input from "@/components/form/input/InputField";
import {
  contactEmailLabelOptions,
  contactPhoneLabelOptions,
  type ContactEmailMethod,
  type ContactPhoneMethod,
} from "@/lib/contact-methods";

type EditableEmailMethod = {
  id: string;
  label: string;
  customLabel: string;
  email: string;
};

type EditablePhoneMethod = {
  id: string;
  label: string;
  customLabel: string;
  phone: string;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const iconButtonClassName =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-200";

const addButtonClassName =
  "inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

function methodId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function editableLabel(
  label: string | null | undefined,
  options: readonly string[],
) {
  const cleanedLabel = label?.trim() || "Other";

  return options.includes(cleanedLabel)
    ? { label: cleanedLabel, customLabel: "" }
    : { label: "Other", customLabel: cleanedLabel };
}

function resolvedLabel(method: { label: string; customLabel: string }) {
  return method.label === "Other"
    ? method.customLabel.trim() || "Other"
    : method.label.trim() || "Other";
}

function emailRows(defaultEmails: ContactEmailMethod[] | undefined) {
  return (defaultEmails ?? []).map((method, index) => {
    const label = editableLabel(method.label, contactEmailLabelOptions);

    return {
      id: method.id ?? `email-${index}`,
      ...label,
      email: method.email,
    };
  });
}

function phoneRows(defaultPhones: ContactPhoneMethod[] | undefined) {
  return (defaultPhones ?? []).map((method, index) => {
    const label = editableLabel(method.label, contactPhoneLabelOptions);

    return {
      id: method.id ?? `phone-${index}`,
      ...label,
      phone: method.phone,
    };
  });
}

function emailPayload(methods: EditableEmailMethod[]) {
  return methods
    .map((method) => ({
      label: resolvedLabel(method),
      email: method.email.trim(),
    }))
    .filter((method) => method.email);
}

function phonePayload(methods: EditablePhoneMethod[]) {
  return methods
    .map((method) => ({
      label: resolvedLabel(method),
      phone: method.phone.trim(),
    }))
    .filter((method) => method.phone);
}

export default function ContactMethodsEditor({
  defaultEmails,
  defaultPhones,
  id,
  onDirty,
}: {
  defaultEmails?: ContactEmailMethod[];
  defaultPhones?: ContactPhoneMethod[];
  id: string;
  onDirty?: () => void;
}) {
  const [emails, setEmails] = useState<EditableEmailMethod[]>(() =>
    emailRows(defaultEmails),
  );
  const [phones, setPhones] = useState<EditablePhoneMethod[]>(() =>
    phoneRows(defaultPhones),
  );
  const serializedEmails = useMemo(
    () => JSON.stringify(emailPayload(emails)),
    [emails],
  );
  const serializedPhones = useMemo(
    () => JSON.stringify(phonePayload(phones)),
    [phones],
  );

  function markDirty() {
    onDirty?.();
  }

  function updateEmail(
    methodIdValue: string,
    updates: Partial<
      Pick<EditableEmailMethod, "email" | "label" | "customLabel">
    >,
  ) {
    setEmails((current) =>
      current.map((method) =>
        method.id === methodIdValue ? { ...method, ...updates } : method,
      ),
    );
    markDirty();
  }

  function updatePhone(
    methodIdValue: string,
    updates: Partial<
      Pick<EditablePhoneMethod, "phone" | "label" | "customLabel">
    >,
  ) {
    setPhones((current) =>
      current.map((method) =>
        method.id === methodIdValue ? { ...method, ...updates } : method,
      ),
    );
    markDirty();
  }

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
      <input type="hidden" name="additionalEmails" value={serializedEmails} />
      <input type="hidden" name="additionalPhones" value={serializedPhones} />
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
        Additional contact methods
      </h3>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <Mail className="h-4 w-4 text-gray-400" />
              Email addresses
            </div>
            <button
              type="button"
              className={addButtonClassName}
              onClick={() => {
                setEmails((current) => [
                  ...current,
                  {
                    id: methodId("email"),
                    label: "Work",
                    customLabel: "",
                    email: "",
                  },
                ]);
                markDirty();
              }}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          <div className="space-y-3">
            {emails.length ? (
              emails.map((method, index) => (
                <div
                  key={method.id}
                  className="grid gap-2 sm:grid-cols-[118px_minmax(0,1fr)_44px]"
                >
                  <select
                    aria-label={`Additional email ${index + 1} label`}
                    className={selectClassName}
                    value={method.label}
                    onChange={(event) => {
                      const label = event.target.value;
                      updateEmail(method.id, {
                        label,
                        customLabel:
                          label === "Other" ? method.customLabel : "",
                      });
                    }}
                  >
                    {contactEmailLabelOptions.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-2">
                    {method.label === "Other" ? (
                      <Input
                        aria-label={`Additional email ${index + 1} custom label`}
                        id={`${id}-additional-email-${index}-custom-label`}
                        type="text"
                        value={method.customLabel}
                        placeholder="Custom label"
                        onChange={(event) =>
                          updateEmail(method.id, {
                            customLabel: event.target.value,
                          })
                        }
                      />
                    ) : null}
                    <Input
                      aria-label={`Additional email ${index + 1}`}
                      id={`${id}-additional-email-${index}`}
                      type="email"
                      value={method.email}
                      placeholder="name@example.com"
                      onChange={(event) =>
                        updateEmail(method.id, { email: event.target.value })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove additional email ${index + 1}`}
                    className={iconButtonClassName}
                    onClick={() => {
                      setEmails((current) =>
                        current.filter((candidate) => candidate.id !== method.id),
                      );
                      markDirty();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400">No additional email addresses</p>
            )}
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <Phone className="h-4 w-4 text-gray-400" />
              Phone numbers
            </div>
            <button
              type="button"
              className={addButtonClassName}
              onClick={() => {
                setPhones((current) => [
                  ...current,
                  {
                    id: methodId("phone"),
                    label: "Mobile",
                    customLabel: "",
                    phone: "",
                  },
                ]);
                markDirty();
              }}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          <div className="space-y-3">
            {phones.length ? (
              phones.map((method, index) => (
                <div
                  key={method.id}
                  className="grid gap-2 sm:grid-cols-[118px_minmax(0,1fr)_44px]"
                >
                  <select
                    aria-label={`Additional phone ${index + 1} label`}
                    className={selectClassName}
                    value={method.label}
                    onChange={(event) => {
                      const label = event.target.value;
                      updatePhone(method.id, {
                        label,
                        customLabel:
                          label === "Other" ? method.customLabel : "",
                      });
                    }}
                  >
                    {contactPhoneLabelOptions.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-2">
                    {method.label === "Other" ? (
                      <Input
                        aria-label={`Additional phone ${index + 1} custom label`}
                        id={`${id}-additional-phone-${index}-custom-label`}
                        type="text"
                        value={method.customLabel}
                        placeholder="Custom label"
                        onChange={(event) =>
                          updatePhone(method.id, {
                            customLabel: event.target.value,
                          })
                        }
                      />
                    ) : null}
                    <Input
                      aria-label={`Additional phone ${index + 1}`}
                      id={`${id}-additional-phone-${index}`}
                      type="tel"
                      value={method.phone}
                      placeholder="Phone number"
                      onChange={(event) =>
                        updatePhone(method.id, { phone: event.target.value })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove additional phone ${index + 1}`}
                    className={iconButtonClassName}
                    onClick={() => {
                      setPhones((current) =>
                        current.filter((candidate) => candidate.id !== method.id),
                      );
                      markDirty();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400">No additional phone numbers</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
