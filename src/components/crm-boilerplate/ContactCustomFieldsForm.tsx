"use client";

import Label from "@/components/form/Label";
import type {
  ContactCustomFieldDefinition,
  ContactCustomFieldFormValue,
} from "@/lib/contacts/custom-fields";

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";
const textareaClassName = `${inputClassName} min-h-24 resize-y`;

export default function ContactCustomFieldsForm({
  contactTypeId,
  definitions,
  values = {},
}: {
  contactTypeId: string;
  definitions: ContactCustomFieldDefinition[];
  values?: Record<string, ContactCustomFieldFormValue>;
}) {
  const visibleFields = definitions.filter(
    (field) => field.isActive && field.contactTypeId === contactTypeId,
  );

  if (!visibleFields.length) return null;

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
        Type-specific details
      </h3>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        These fields are configured for the selected person type.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {visibleFields.map((field) => (
          <CustomField
            key={field.id}
            definition={field}
            value={values[field.id]}
          />
        ))}
      </div>
    </section>
  );
}

function CustomField({
  definition,
  value,
}: {
  definition: ContactCustomFieldDefinition;
  value?: ContactCustomFieldFormValue;
}) {
  const id = `contact-custom-field-${definition.id}`;
  const name = `customField:${definition.id}`;
  const required = definition.requirementMode === "REQUIRED";
  const isWide = definition.fieldType === "LONG_TEXT" || definition.fieldType === "ADDRESS";
  const stringValue = typeof value === "string" ? value : "";
  const selectedValues = Array.isArray(value) ? value : [];
  const hint = [
    definition.helpText,
    definition.requirementMode === "COMPLETENESS"
      ? "Needed for a complete profile, but it will not block saving."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={isWide ? "md:col-span-2" : undefined}>
      <Label htmlFor={id}>
        {definition.label}
        {required ? <span className="text-error-500"> *</span> : null}
      </Label>
      {definition.fieldType === "LONG_TEXT" || definition.fieldType === "ADDRESS" ? (
        <textarea
          id={id}
          name={name}
          defaultValue={stringValue}
          placeholder={definition.placeholder ?? undefined}
          required={required}
          maxLength={10_000}
          className={textareaClassName}
        />
      ) : definition.fieldType === "SINGLE_SELECT" ? (
        <select
          id={id}
          name={name}
          defaultValue={stringValue}
          required={required}
          className={inputClassName}
        >
          <option value="">Select an option</option>
          {definition.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : definition.fieldType === "MULTI_SELECT" ? (
        <select
          id={id}
          name={name}
          defaultValue={selectedValues}
          required={required}
          multiple
          className={`${inputClassName} min-h-28 py-2`}
        >
          {definition.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : definition.fieldType === "BOOLEAN" ? (
        <select
          id={id}
          name={name}
          defaultValue={typeof value === "boolean" ? String(value) : ""}
          required={required}
          className={inputClassName}
        >
          <option value="">Select an option</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input
          id={id}
          name={name}
          type={inputType(definition.fieldType)}
          defaultValue={stringValue}
          placeholder={definition.placeholder ?? undefined}
          required={required}
          maxLength={definition.fieldType === "EMAIL" ? 320 : 500}
          step={definition.fieldType === "NUMBER" ? "any" : undefined}
          className={inputClassName}
        />
      )}
      {hint ? (
        <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function inputType(type: ContactCustomFieldDefinition["fieldType"]) {
  switch (type) {
    case "DATE":
      return "date";
    case "EMAIL":
      return "email";
    case "NUMBER":
      return "number";
    case "PHONE":
      return "tel";
    case "URL":
      return "url";
    default:
      return "text";
  }
}
