"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { updateDocuSignIntegrationAction } from "@/lib/actions/integrations";

export type DocuSignSettings = {
  accountId?: string;
  baseUri?: string;
  defaultEmailMessage?: string;
  defaultEmailSubject?: string;
  environment?: "demo" | "production";
  webhookBaseUrl?: string;
};

function docuSignConsentUrl({
  environment,
  integrationKey,
}: {
  environment: "demo" | "production";
  integrationKey: string;
}) {
  const host =
    environment === "production"
      ? "https://account.docusign.com"
      : "https://account-d.docusign.com";
  const url = new URL(`${host}/oauth/auth`);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "signature impersonation");
  url.searchParams.set("client_id", integrationKey);
  url.searchParams.set("redirect_uri", "https://www.docusign.com");

  return url.toString();
}

export default function DocuSignSettingsForm({
  canEdit,
  config,
  hasEncryptionKey,
  hasStoredCredentials,
  onSaved,
}: {
  canEdit: boolean;
  config: DocuSignSettings;
  hasEncryptionKey: boolean;
  hasStoredCredentials: boolean;
  onSaved?: (connected: boolean) => void;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const [environment, setEnvironment] = useState<"demo" | "production">(
    config.environment ?? "demo",
  );
  const [integrationKey, setIntegrationKey] = useState("");
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    updateDocuSignIntegrationAction,
    {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
    },
  );
  const credentialLabel = hasStoredCredentials
    ? "Credentials saved"
    : "Credentials missing";
  const consentUrl = useMemo(() => {
    const key = integrationKey.trim();

    return key ? docuSignConsentUrl({ environment, integrationKey: key }) : "";
  }, [environment, integrationKey]);

  useEffect(() => {
    if (!state.ok || state.savedAt === null) return;

    showToast(state.message || "DocuSign settings saved.");
    queueMicrotask(() => {
      setIsDirty(false);
      setIntegrationKey("");
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
              Used to send CRM documents for electronic signature.
            </p>
          </div>
          <span
            className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
              hasStoredCredentials
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
            }`}
          >
            {credentialLabel}
          </span>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {hasEncryptionKey ? (
            "Leave credential fields blank to keep the saved values."
          ) : (
            <>
              Set <code>CREDENTIAL_ENCRYPTION_KEY</code> before saving
              credentials.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="docusign-environment">Environment</Label>
          <select
            id="docusign-environment"
            name="environment"
            value={environment}
            onChange={(event) =>
              setEnvironment(event.target.value as "demo" | "production")
            }
            disabled={!canEdit}
            className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="demo">Demo</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div>
          <Label htmlFor="docusign-account-id">Account ID</Label>
          <Input
            id="docusign-account-id"
            name="accountId"
            defaultValue={config.accountId ?? ""}
            disabled={!canEdit}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="docusign-base-uri">REST API base URI</Label>
          <Input
            id="docusign-base-uri"
            name="baseUri"
            defaultValue={config.baseUri ?? ""}
            placeholder={
              environment === "production"
                ? "https://www.docusign.net/restapi"
                : "https://demo.docusign.net/restapi"
            }
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="docusign-webhook-base-url">Webhook base URL</Label>
          <Input
            id="docusign-webhook-base-url"
            name="webhookBaseUrl"
            defaultValue={config.webhookBaseUrl ?? ""}
            placeholder="https://crm.epc-improvements.co.uk"
            disabled={!canEdit}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="docusign-integration-key">Integration key</Label>
          <Input
            id="docusign-integration-key"
            name="integrationKey"
            type="password"
            autoComplete="new-password"
            value={integrationKey}
            onChange={(event) => setIntegrationKey(event.target.value)}
            placeholder={
              hasStoredCredentials ? "Saved - leave blank to keep" : ""
            }
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="docusign-impersonated-user-id">
            Impersonated user ID
          </Label>
          <Input
            id="docusign-impersonated-user-id"
            name="impersonatedUserId"
            type="password"
            autoComplete="new-password"
            placeholder={
              hasStoredCredentials ? "Saved - leave blank to keep" : ""
            }
            disabled={!canEdit}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="docusign-private-key">Private key</Label>
        <textarea
          id="docusign-private-key"
          name="privateKey"
          rows={6}
          placeholder={
            hasStoredCredentials ? "Saved - leave blank to keep" : ""
          }
          disabled={!canEdit}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>

      <div>
        <Label htmlFor="docusign-connect-hmac-secret">
          Connect HMAC secret
        </Label>
        <Input
          id="docusign-connect-hmac-secret"
          name="connectHmacSecret"
          type="password"
          autoComplete="new-password"
          placeholder={
            hasStoredCredentials ? "Saved - leave blank to keep" : ""
          }
          disabled={!canEdit}
        />
      </div>

      {consentUrl ? (
        <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm dark:border-brand-900/40 dark:bg-brand-900/20">
          <a
            href={consentUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
          >
            Grant DocuSign JWT consent
          </a>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="docusign-default-email-subject">
            Default email subject
          </Label>
          <Input
            id="docusign-default-email-subject"
            name="defaultEmailSubject"
            defaultValue={
              config.defaultEmailSubject ?? "Please sign this document"
            }
            maxLength={140}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="docusign-default-email-message">
            Default email message
          </Label>
          <textarea
            id="docusign-default-email-message"
            name="defaultEmailMessage"
            rows={3}
            defaultValue={config.defaultEmailMessage ?? ""}
            maxLength={1000}
            disabled={!canEdit}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
      </div>

      <div className="space-y-4">
        <ActionStateMessage state={state.ok ? undefined : state} />
        <button
          type="submit"
          disabled={!canEdit || isPending || !isDirty}
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save DocuSign settings"}
        </button>
      </div>
    </form>
  );
}
