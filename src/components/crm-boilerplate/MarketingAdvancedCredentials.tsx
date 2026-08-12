"use client";

import Field from "@/components/crm-boilerplate/ProviderOptionField";

export type MarketingAdvancedCredentialField = {
  id: string;
  label: string;
  name: string;
  placeholder: string;
  envKey?: string;
  type?: "password" | "text";
};

export default function MarketingAdvancedCredentials({
  canEdit,
  description = "Use this only for direct CRM fallback connections. iD30 Auth managed connections use server-side provider environment values and never expose secret values here.",
  fields,
}: {
  canEdit: boolean;
  description?: string;
  fields: MarketingAdvancedCredentialField[];
}) {
  if (!canEdit) return null;

  return (
    <details className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <summary className="cursor-pointer text-sm font-semibold text-gray-700 marker:text-gray-400 dark:text-gray-200">
        Advanced manual credential fallback
      </summary>
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {description}
      </p>
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
        Leave secret fields blank to keep existing saved values.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.name}>
            <Field
              id={field.id}
              label={field.label}
              name={field.name}
              placeholder={field.placeholder}
              defaultValue=""
              disabled={!canEdit}
              type={field.type ?? "text"}
            />
            {field.envKey ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Fallback env key:{" "}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-gray-700 dark:bg-white/10 dark:text-gray-200">
                  {field.envKey}
                </code>
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}
