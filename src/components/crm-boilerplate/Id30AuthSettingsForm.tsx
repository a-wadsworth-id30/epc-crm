"use client";

import { useActionState, useEffect } from "react";
import {
  disconnectId30AuthIntegrationAction,
  updateId30AuthIntegrationAction,
} from "@/lib/actions/id30-auth";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

export type Id30AuthPublicSettings = {
  baseUrl?: string;
  connectedAt?: string;
  crmClientId?: string;
  lastSavedAt?: string;
  source?: "env" | "manual" | "setup-code" | "bootstrap";
  workspaceId?: string;
};

const initialState = {
  connected: false,
  message: "",
  ok: false,
  savedAt: null,
};

export default function Id30AuthSettingsForm({
  appBaseUrl,
  bootstrapUrl,
  callbackUrl,
  canEdit,
  config,
  credentialSource = "missing",
  hasEncryptionKey,
  hasStoredCredentials,
  onSaved,
  setupMessage,
  setupStatus,
}: {
  appBaseUrl: string;
  bootstrapUrl: string;
  callbackUrl: string;
  canEdit: boolean;
  config?: Id30AuthPublicSettings;
  credentialSource?: "database" | "environment" | "missing" | "placeholder";
  hasEncryptionKey: boolean;
  hasStoredCredentials: boolean;
  onSaved?: (connected: boolean) => void;
  setupMessage?: string;
  setupStatus?: "connected" | "failed";
}) {
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    updateId30AuthIntegrationAction,
    initialState,
  );
  const [disconnectState, disconnectAction, isDisconnectPending] = useActionState(
    disconnectId30AuthIntegrationAction,
    initialState,
  );
  const isBusy = isPending || isDisconnectPending;
  const hasEnvironmentCredentials = credentialSource === "environment";
  const disabled = !canEdit || isBusy || !hasEncryptionKey;
  const sharedSecretPlaceholder = hasStoredCredentials
    ? "Leave blank to keep saved shared secret"
    : "Paste the iD30-provisioned shared secret";

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message);
    onSaved?.(state.connected);
  }, [onSaved, showToast, state.connected, state.message, state.savedAt]);

  useEffect(() => {
    if (!disconnectState.message) return;
    showToast(disconnectState.message);
    onSaved?.(disconnectState.connected);
  }, [
    disconnectState.connected,
    disconnectState.message,
    disconnectState.savedAt,
    onSaved,
    showToast,
  ]);

  return (
    <div className="space-y-5">
      {!hasEncryptionKey ? (
        <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-300">
          Set CREDENTIAL_ENCRYPTION_KEY before saving the Auth shared secret.
        </p>
      ) : null}

      {setupStatus ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            setupStatus === "connected"
              ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
              : "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
          }`}
        >
          {setupMessage ??
            (setupStatus === "connected"
              ? "iD30 Auth connected."
              : "iD30 Auth setup could not be completed.")}
        </p>
      ) : null}

      {hasEnvironmentCredentials ? (
        <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300">
          iD30 Auth is configured from environment variables. Saving broker
          details here will move this CRM to database-stored configuration.
        </p>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
          Auth client details
        </p>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Allowed origin
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-gray-800 dark:text-white/90">
              {appBaseUrl}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Callback URL
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-gray-800 dark:text-white/90">
              {callbackUrl}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-900/40 dark:bg-brand-900/15">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">
              Internal iD30 setup
            </p>
            <p className="mt-1 text-sm leading-5 text-brand-700 dark:text-brand-300">
              Use this when iD30 provisions or updates the Auth broker for this
              CRM. Clients do not need Auth dashboard access.
            </p>
          </div>
          <a
            href={bootstrapUrl}
            aria-disabled={disabled}
            className={`inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-medium text-white ${
              disabled
                ? "pointer-events-none bg-brand-300"
                : "bg-brand-500 hover:bg-brand-600"
            }`}
          >
            Start internal setup
          </a>
        </div>
      </div>

      <form action={formAction} className="space-y-5">
        <details className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700 marker:text-gray-400 dark:text-gray-200">
            Advanced connection details
          </summary>
          <div className="mt-4">
            <label
              htmlFor="id30-auth-setup-code"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Setup code
            </label>
            <textarea
              id="id30-auth-setup-code"
              name="setupCode"
              rows={4}
              disabled={disabled}
              placeholder="Paste an iD30 Auth setup code"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              id="id30-auth-base-url"
              label="Auth URL"
              name="baseUrl"
              placeholder="https://auth.id30.com"
              defaultValue={config?.baseUrl ?? "https://auth.id30.com"}
              disabled={disabled}
              type="url"
            />
            <Field
              id="id30-auth-crm-client-id"
              label="CRM client ID"
              name="crmClientId"
              placeholder="client-crm-production"
              defaultValue={config?.crmClientId ?? ""}
              disabled={disabled}
            />
            <Field
              id="id30-auth-workspace-id"
              label="Workspace ID"
              name="workspaceId"
              placeholder="client-production"
              defaultValue={config?.workspaceId ?? ""}
              disabled={disabled}
            />
            <Field
              id="id30-auth-shared-secret"
              label="Shared secret"
              name="sharedSecret"
              placeholder={sharedSecretPlaceholder}
              defaultValue=""
              disabled={disabled}
              type="password"
            />
          </div>
        </details>

        {state.message ? (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              state.ok
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
            }`}
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          {hasStoredCredentials ? (
            <button
              formAction={disconnectAction}
              type="submit"
              disabled={!canEdit || isBusy}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              {isDisconnectPending ? "Disconnecting..." : "Disconnect"}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {isPending ? "Saving..." : "Save broker details"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  defaultValue,
  disabled,
  id,
  label,
  name,
  placeholder,
  type = "text",
}: {
  defaultValue: string;
  disabled: boolean;
  id: string;
  label: string;
  name: string;
  placeholder: string;
  type?: "password" | "text" | "url";
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
      />
    </div>
  );
}
