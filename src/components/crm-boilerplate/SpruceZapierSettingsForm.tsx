"use client";

import { useActionState, useEffect, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import SpruceWebhookReceiverTestForm from "@/components/crm-boilerplate/SpruceWebhookReceiverTestForm";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { updateSpruceZapierIntegrationAction } from "@/lib/actions/integrations";

export type SpruceZapierSettings = {
  defaultLeadSource?: string;
  directApiConfigured?: boolean;
  inboundWebhookConfigured?: boolean;
};

export default function SpruceZapierSettingsForm({
  appBaseUrl = "",
  canEdit,
  config,
  credentialSource = "missing",
  hasEncryptionKey,
  hasStoredCredentials,
  onSaved,
}: {
  appBaseUrl?: string;
  canEdit: boolean;
  config: SpruceZapierSettings;
  credentialSource?: "database" | "environment" | "missing" | "placeholder";
  hasEncryptionKey: boolean;
  hasStoredCredentials: boolean;
  onSaved?: (connected: boolean) => void;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    updateSpruceZapierIntegrationAction,
    {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
    },
  );
  const hasEnvironmentCredentials = credentialSource === "environment";
  const inboundWebhookReady = Boolean(
    config.inboundWebhookConfigured ?? hasStoredCredentials,
  );
  const credentialLabel = inboundWebhookReady
    ? hasStoredCredentials
      ? "Webhook secret saved"
      : "Environment configured"
    : "Webhook secret missing";
  const endpoint = appBaseUrl
    ? `${appBaseUrl.replace(/\/+$/, "")}/api/webhooks/spruce`
    : "/api/webhooks/spruce";
  const receiverReady = inboundWebhookReady;
  const directApiReady = Boolean(config.directApiConfigured);

  useEffect(() => {
    if (!state.ok || state.savedAt === null) return;

    showToast(state.message || "Spruce settings saved.");
    queueMicrotask(() => {
      setIsDirty(false);
      onSaved?.(state.connected);
    });
  }, [onSaved, showToast, state.connected, state.message, state.ok, state.savedAt]);

  return (
    <div className="space-y-5">
      <form
        action={formAction}
        onChangeCapture={() => setIsDirty(true)}
        className="space-y-5"
      >
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Inbound Zapier receiver
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Spruce events can be posted into the CRM. Outbound CRM sends
                are manual only.
              </p>
            </div>
            <span
              className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
                receiverReady
                  ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                  : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
              }`}
            >
              {receiverReady ? "Webhook secret ready" : credentialLabel}
            </span>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {hasEnvironmentCredentials && inboundWebhookReady ? (
              "The receiver secret is available from environment variables. Save a secret here only when this CRM should override that runtime config."
            ) : hasEncryptionKey ? (
              "Leave the webhook secret blank to keep the saved value."
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
            <Label htmlFor="spruce-zapier-endpoint">Receiver endpoint</Label>
            <Input
              id="spruce-zapier-endpoint"
              type="text"
              value={endpoint}
              readOnly
              disabled
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Use this URL as the destination in a Zapier webhook POST step.
            </p>
          </div>

          <div>
            <Label htmlFor="spruce-zapier-secret">Webhook secret</Label>
            <Input
              id="spruce-zapier-secret"
              name="webhookSecret"
              type="password"
              autoComplete="new-password"
              placeholder={
                hasStoredCredentials || receiverReady
                  ? "Saved - leave blank to keep"
                  : ""
              }
              disabled={!canEdit}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Zapier should send this as a bearer token or
              x-spruce-webhook-secret header.
            </p>
          </div>

          <div>
            <Label htmlFor="spruce-default-lead-source">
              Default CRM lead source
            </Label>
            <Input
              id="spruce-default-lead-source"
              name="defaultLeadSource"
              defaultValue={config.defaultLeadSource ?? "Spruce"}
              maxLength={80}
              disabled={!canEdit}
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  Manual CRM to Spruce send
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Single sale records can be sent through the Spruce API only
                  when an admin confirms the sale action.
                </p>
              </div>
              <span
                className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  directApiReady
                    ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                    : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
                }`}
              >
                {directApiReady ? "API ready" : "API key missing"}
              </span>
            </div>
          </div>

          <div>
            <Label htmlFor="spruce-api-key">Spruce API key</Label>
            <Input
              id="spruce-api-key"
              name="apiKey"
              type="password"
              autoComplete="new-password"
              placeholder={directApiReady ? "Saved - leave blank to keep" : ""}
              disabled={!canEdit}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Used by the manual Send to Spruce button to create Spruce jobs
              directly.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <ActionStateMessage state={state.ok ? undefined : state} />
          <button
            type="submit"
            disabled={!canEdit || isPending || !isDirty}
            className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Spruce settings"}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="mb-3">
          <p className="text-sm font-medium text-gray-800 dark:text-white/90">
            Receiver self-test
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Posts a no-op payload through the live CRM receiver and writes zero
            CRM records.
          </p>
        </div>
        <SpruceWebhookReceiverTestForm disabled={!receiverReady} />
      </div>
    </div>
  );
}
