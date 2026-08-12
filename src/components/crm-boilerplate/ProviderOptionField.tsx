"use client";

import { useState } from "react";
import type { MarketingProviderSelectorOption } from "@/lib/marketing/integrations";

type ProviderOptionFieldProps = {
  autoComplete?: string;
  id: string;
  inputMode?:
    | "decimal"
    | "email"
    | "none"
    | "numeric"
    | "search"
    | "tel"
    | "text"
    | "url";
  label: string;
  name: string;
  pattern?: string;
  placeholder: string;
  defaultValue: string;
  disabled: boolean;
  required?: boolean;
  type?: "password" | "text";
  options?: MarketingProviderSelectorOption[];
};

export default function ProviderOptionField({
  defaultValue,
  name,
  options = [],
  type = "text",
  ...props
}: ProviderOptionFieldProps) {
  const hasOptions = options.length > 0 && type === "text";
  const optionKey = hasOptions ? options.map((option) => option.id).join("|") : "";
  const resetKey = [name, defaultValue, type, optionKey].join(":");

  return (
    <ProviderOptionFieldControl
      key={resetKey}
      name={name}
      defaultValue={defaultValue}
      options={options}
      type={type}
      {...props}
    />
  );
}

function ProviderOptionFieldControl({
  autoComplete,
  id,
  inputMode,
  label,
  name,
  pattern,
  placeholder,
  defaultValue,
  disabled,
  required = false,
  type = "text",
  options = [],
}: ProviderOptionFieldProps) {
  const hasOptions = options.length > 0 && type === "text";
  const defaultMatchesOption =
    hasOptions && options.some((option) => option.id === defaultValue);
  const [entryMode, setEntryMode] = useState<"manual" | "option">(
    hasOptions && (!defaultValue || defaultMatchesOption) ? "option" : "manual",
  );
  const [manualValue, setManualValue] = useState(defaultValue);
  const [selectedValue, setSelectedValue] = useState(
    defaultMatchesOption ? defaultValue : "",
  );
  const resolvedAutoComplete =
    autoComplete ?? (type === "password" ? "new-password" : "off");
  const controlClassName =
    "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 dark:disabled:bg-gray-900/60";
  const toggleButtonClassName =
    "inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05] dark:disabled:text-gray-600";

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
      >
        {label}
      </label>
      {hasOptions && entryMode === "option" ? (
        <div className="flex gap-2">
          <select
            id={id}
            name={name}
            required={required}
            disabled={disabled}
            value={selectedValue}
            onChange={(event) => setSelectedValue(event.target.value)}
            autoComplete={resolvedAutoComplete}
            className={controlClassName}
          >
            <option value="" disabled={required}>
              {required ? `Select ${label.toLowerCase()}` : "Not selected"}
            </option>
            {options.map((option) => (
              <option key={`${option.id}-${option.name ?? ""}`} value={option.id}>
                {providerOptionLabel(option)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled}
            className={toggleButtonClassName}
            onClick={() => setEntryMode("manual")}
          >
            Manual
          </button>
        </div>
      ) : (
        <div className={hasOptions ? "flex gap-2" : undefined}>
          <input
            id={id}
            name={name}
            type={type}
            required={required}
            disabled={disabled}
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            autoComplete={resolvedAutoComplete}
            inputMode={inputMode}
            pattern={pattern}
            placeholder={placeholder}
            className={controlClassName}
          />
          {hasOptions ? (
            <button
              type="button"
              disabled={disabled}
              className={toggleButtonClassName}
              onClick={() => {
                setSelectedValue(defaultMatchesOption ? defaultValue : "");
                setEntryMode("option");
              }}
            >
              Options
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function providerOptionLabel(option: MarketingProviderSelectorOption) {
  const primary = option.name ? `${option.name} (${option.id})` : option.id;

  return [primary, option.description, option.status]
    .filter((value): value is string => Boolean(value))
    .join(" - ");
}
