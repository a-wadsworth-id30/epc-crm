"use client";

import { useActionState, useEffect, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { updatePipedriveIntegrationAction } from "@/lib/actions/integrations";

const defaultPipedriveApiBaseUrl = "https://api.pipedrive.com/v1";
const defaultPipedriveLeadSource = "Pipedrive";

export type PipedriveSettings = {
  apiBaseUrl?: string;
  contactFieldMappings?: Array<{
    contactFieldId: string;
    sourceFieldKey: string;
  }>;
  defaultLeadSource?: string;
};

export type PipedriveContactFieldOption = {
  fieldType: string;
  id: string;
  label: string;
};

export default function PipedriveSettingsForm({
  canEdit,
  config,
  contactFields,
  credentialSource = "missing",
  hasEncryptionKey,
  hasStoredCredentials,
  onSaved,
}: {
  canEdit: boolean;
  config: PipedriveSettings;
  contactFields?: PipedriveContactFieldOption[];
  credentialSource?: "database" | "environment" | "missing" | "placeholder";
  hasEncryptionKey: boolean;
  hasStoredCredentials: boolean;
  onSaved?: (connected: boolean) => void;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const [contactFieldMappings, setContactFieldMappings] = useState(
    config.contactFieldMappings ?? [],
  );
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    updatePipedriveIntegrationAction,
    {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
    },
  );
  const hasEnvironmentCredentials = credentialSource === "environment";
  const credentialLabel = hasStoredCredentials
    ? "Credentials saved"
    : hasEnvironmentCredentials
      ? "Environment configured"
      : "Credentials missing";

  useEffect(() => {
    if (!state.ok || state.savedAt === null) return;

    showToast(state.message || "Pipedrive settings saved.");
    queueMicrotask(() => {
      setIsDirty(false);
      onSaved?.(state.connected);
    });
  }, [
    onSaved,
    showToast,
    state.connected,
    state.message,
    state.ok,
    state.savedAt,
  ]);

  return (
    <form
      action={formAction}
      onChangeCapture={() => setIsDirty(true)}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="contactFieldMappings"
        value={JSON.stringify(contactFieldMappings)}
      />
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              Credential storage
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Used for importing Pipedrive leads into CRM contacts, companies
              and opportunities.
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              This integration is pull-only. The CRM will not write back to
              Pipedrive unless that is explicitly approved for a later change.
            </p>
          </div>
          <span
            className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
              hasStoredCredentials
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : hasEnvironmentCredentials
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
                  : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
            }`}
          >
            {credentialLabel}
          </span>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {hasEnvironmentCredentials ? (
            "Pipedrive is available from environment variables. Save an API token here only when this CRM should override that runtime config."
          ) : hasEncryptionKey ? (
            "Leave the API token blank to keep the saved credential."
          ) : (
            <>
              Set <code>CREDENTIAL_ENCRYPTION_KEY</code> before saving
              credentials.
            </>
          )}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="pipedrive-api-token">API token</Label>
          <Input
            id="pipedrive-api-token"
            name="apiToken"
            type="password"
            autoComplete="new-password"
            placeholder={hasStoredCredentials ? "Saved - leave blank to keep" : ""}
            disabled={!canEdit}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="pipedrive-api-base-url">API base URL</Label>
            <Input
              id="pipedrive-api-base-url"
              name="apiBaseUrl"
              defaultValue={config.apiBaseUrl ?? defaultPipedriveApiBaseUrl}
              placeholder={defaultPipedriveApiBaseUrl}
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label htmlFor="pipedrive-default-lead-source">
              Default lead source
            </Label>
            <Input
              id="pipedrive-default-lead-source"
              name="defaultLeadSource"
              defaultValue={
                config.defaultLeadSource ?? defaultPipedriveLeadSource
              }
              placeholder={defaultPipedriveLeadSource}
              maxLength={80}
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>

      {contactFields ? (
        <section className="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Pipedrive person field mappings
            </h3>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Map Pipedrive person field keys into active Consumer fields. Imports fill missing CRM values and never overwrite information entered by staff.
            </p>
          </div>

          <div className="space-y-3">
            {contactFieldMappings.map((mapping, index) => {
              const targetAvailable = contactFields.some(
                (field) => field.id === mapping.contactFieldId,
              );

              return (
                <div
                  key={`${mapping.contactFieldId}:${index}`}
                  className="grid gap-3 rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <div>
                    <Label htmlFor={`pipedrive-person-field-${index}`}>
                      Pipedrive field key
                    </Label>
                    <Input
                      id={`pipedrive-person-field-${index}`}
                      value={mapping.sourceFieldKey}
                      onChange={(event) => {
                        const sourceFieldKey = event.target.value;
                        setContactFieldMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, sourceFieldKey }
                              : item,
                          ),
                        );
                      }}
                      placeholder="Pipedrive person field API key"
                      maxLength={160}
                      disabled={!canEdit}
                    />
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      CRM Consumer field
                    </span>
                    <select
                      value={mapping.contactFieldId}
                      onChange={(event) => {
                        const contactFieldId = event.target.value;
                        setContactFieldMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, contactFieldId }
                              : item,
                          ),
                        );
                      }}
                      disabled={!canEdit}
                      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                    >
                      {!targetAvailable ? (
                        <option value={mapping.contactFieldId}>
                          Unavailable field ({mapping.contactFieldId})
                        </option>
                      ) : null}
                      {contactFields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.label} · {field.fieldType.toLowerCase().replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setContactFieldMappings((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      );
                      setIsDirty(true);
                    }}
                    disabled={!canEdit}
                    className="h-11 self-end rounded-lg border border-error-200 px-3 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-60 dark:border-error-900/50 dark:hover:bg-error-500/10"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              const firstUnused = contactFields.find(
                (field) =>
                  !contactFieldMappings.some(
                    (mapping) => mapping.contactFieldId === field.id,
                  ),
              );
              if (!firstUnused) return;
              setContactFieldMappings((current) => [
                ...current,
                { contactFieldId: firstUnused.id, sourceFieldKey: "" },
              ]);
              setIsDirty(true);
            }}
            disabled={
              !canEdit ||
              !contactFields.some(
                (field) =>
                  !contactFieldMappings.some(
                    (mapping) => mapping.contactFieldId === field.id,
                  ),
              )
            }
            className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Add field mapping
          </button>
        </section>
      ) : null}

      <div className="space-y-4">
        <ActionStateMessage state={state.ok ? undefined : state} />
        <button
          type="submit"
          disabled={!canEdit || isPending || !isDirty}
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Pipedrive settings"}
        </button>
      </div>
    </form>
  );
}
