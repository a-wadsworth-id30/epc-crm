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
  defaultLeadSource?: string;
};

export default function PipedriveSettingsForm({
  canEdit,
  config,
  credentialSource = "missing",
  hasEncryptionKey,
  hasStoredCredentials,
  onSaved,
}: {
  canEdit: boolean;
  config: PipedriveSettings;
  credentialSource?: "database" | "environment" | "missing" | "placeholder";
  hasEncryptionKey: boolean;
  hasStoredCredentials: boolean;
  onSaved?: (connected: boolean) => void;
}) {
  const [isDirty, setIsDirty] = useState(false);
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
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              Credential storage
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Used for importing Pipedrive leads and deals into CRM contacts,
              companies and opportunities.
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
