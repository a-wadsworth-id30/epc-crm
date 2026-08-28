"use client";

import { useActionState, useEffect, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import CopyButton from "@/components/crm-boilerplate/CopyButton";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { updateMailerSendIntegrationAction } from "@/lib/actions/integrations";

export type MailerSendSettings = {
  domainName?: string;
  domainId?: string;
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  inboundDomain?: string;
  inboundRouteId?: string;
  inboundRouteName?: string;
  inboundCatchRecipient?: string;
  webhookBaseUrl?: string;
  spfHost?: string;
  spfValue?: string;
  dkimHost?: string;
  dkimValue?: string;
  returnPathHost?: string;
  returnPathValue?: string;
  trackingHost?: string;
  trackingValue?: string;
  inboundMxHost?: string;
  inboundMxValue?: string;
  inboundMxPriority?: number;
  spfVerified?: boolean;
  dkimVerified?: boolean;
  returnPathVerified?: boolean;
  trackingVerified?: boolean;
  inboundVerified?: boolean;
  domainStatus?: string;
  lastCheckedAt?: string;
};

type ValidationKey = "spf" | "dkim" | "returnPath" | "tracking" | "inbound";

function Field({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function WebhookUrl({ baseUrl }: { baseUrl?: string }) {
  const value = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/api/webhooks/mailersend/inbound`
    : "/api/webhooks/mailersend/inbound";

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        Inbound webhook URL
      </p>
      <code className="mt-1 block break-all text-xs text-gray-700 dark:text-gray-300">
        {value}
      </code>
    </div>
  );
}

export default function MailerSendSettingsForm({
  canEdit,
  config,
  hasEncryptionKey,
  hasStoredCredentials,
  onSaved,
}: {
  canEdit: boolean;
  config: MailerSendSettings;
  hasEncryptionKey: boolean;
  hasStoredCredentials: boolean;
  onSaved?: (connected: boolean) => void;
}) {
  const { showToast } = useToast();
  const [validationConfig, setValidationConfig] = useState(config);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [state, formAction, isPending] = useActionState(
    updateMailerSendIntegrationAction,
    {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
    },
  );

  useEffect(() => {
    if (!state.ok || state.savedAt === null) return;

    showToast(state.message || "MailerSend settings saved.");
    onSaved?.(state.connected);
  }, [onSaved, showToast, state.connected, state.message, state.ok, state.savedAt]);

  useEffect(() => {
    setValidationConfig(config);
  }, [config]);

  async function refreshDomainValidation() {
    setIsRefreshing(true);
    setRefreshError("");

    try {
      const response = await fetch(
        "/api/integrations/mailersend/domain-validation",
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      const body = (await response.json()) as {
        ok?: boolean;
        connected?: boolean;
        config?: Partial<MailerSendSettings>;
        message?: string;
      };

      if (!response.ok || !body.ok) {
        throw new Error(body.message ?? "MailerSend domain validation refresh failed.");
      }

      setValidationConfig((current) => ({
        ...current,
        ...body.config,
      }));
      onSaved?.(Boolean(body.connected));
      showToast("MailerSend DNS records and domain validation refreshed.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "MailerSend domain validation refresh failed.";
      setRefreshError(message);
      showToast(message);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      {!hasEncryptionKey ? (
        <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
          Set CREDENTIAL_ENCRYPTION_KEY before saving API tokens or inbound
          route secrets.
        </div>
      ) : null}

      <form action={formAction} className="space-y-6">
        <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
          Domain and sender
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Domain name">
            <Input
              name="domainName"
              defaultValue={config.domainName ?? ""}
              placeholder="example.com"
              disabled={!canEdit}
              required
            />
          </Field>
          <Field label="MailerSend domain ID">
            <Input
              name="domainId"
              defaultValue={config.domainId ?? ""}
              placeholder="Optional MailerSend domain ID"
              disabled={!canEdit}
            />
          </Field>
          <Field label="Default from name">
            <Input
              name="fromName"
              defaultValue={config.fromName ?? ""}
              placeholder="iD30"
              disabled={!canEdit}
            />
          </Field>
          <Field label="Default from email">
            <Input
              name="fromEmail"
              type="email"
              defaultValue={config.fromEmail ?? ""}
              placeholder="hello@example.com"
              disabled={!canEdit}
            />
          </Field>
          <Field label="Reply-to email">
            <Input
              name="replyToEmail"
              type="email"
              defaultValue={config.replyToEmail ?? ""}
              placeholder="sales@example.com"
              disabled={!canEdit}
            />
          </Field>
          <Field label="API token">
            <Input
              name="apiToken"
              type="password"
              autoComplete="new-password"
              placeholder={hasStoredCredentials ? "Saved - leave blank to keep" : ""}
              disabled={!canEdit}
            />
          </Field>
        </div>
        </section>

        <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
          Inbound route
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Webhook base URL">
            <Input
              name="webhookBaseUrl"
              type="url"
              defaultValue={config.webhookBaseUrl ?? ""}
              placeholder={["https://crm", "epc-improvements.co.uk"].join(".")}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Inbound route secret">
            <Input
              name="inboundSecret"
              type="password"
              autoComplete="new-password"
              placeholder={hasStoredCredentials ? "Saved - leave blank to keep" : ""}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Inbound domain">
            <Input
              name="inboundDomain"
              defaultValue={config.inboundDomain ?? ""}
              placeholder="inbound.example.com"
              disabled={!canEdit}
            />
          </Field>
          <Field label="Inbound route ID">
            <Input
              name="inboundRouteId"
              defaultValue={config.inboundRouteId ?? ""}
              placeholder="MailerSend route ID"
              disabled={!canEdit}
            />
          </Field>
          <Field label="Inbound route name">
            <Input
              name="inboundRouteName"
              defaultValue={config.inboundRouteName ?? ""}
              placeholder="CRM inbound"
              disabled={!canEdit}
            />
          </Field>
          <Field label="Catch recipient">
            <Input
              name="inboundCatchRecipient"
              defaultValue={config.inboundCatchRecipient ?? ""}
              placeholder="sales or catch-all"
              disabled={!canEdit}
            />
          </Field>
          <div className="md:col-span-2">
            <WebhookUrl baseUrl={config.webhookBaseUrl} />
          </div>
        </div>
        </section>

        <ActionStateMessage state={state} />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canEdit || isPending}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save MailerSend"}
          </button>
        </div>
      </form>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
          Domain validation
        </h3>
        <MailerSendValidationPanel config={validationConfig} />
        <div className="mt-4 space-y-3">
          {refreshError ? (
            <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-300">
              {refreshError}
            </div>
          ) : null}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!canEdit || isRefreshing || !config.domainId || !hasStoredCredentials}
              onClick={() => void refreshDomainValidation()}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
            >
              {isRefreshing ? "Refreshing..." : "Refresh DNS and validation"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MailerSendValidationPanel({ config }: { config: MailerSendSettings }) {
  const rows = buildValidationRows(config);
  const verifiedCount = rows.filter((row) => row.verified).length;
  const status = config.domainStatus || (verifiedCount ? "PARTIAL" : "NOT_CHECKED");

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {rows.map((row) => (
          <div
            key={row.key}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              {row.verified ? "Verified" : "Pending"}
            </p>
            <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
              {row.label}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-white/[0.03]">
            <tr>
              <TableHeader>Purpose</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Host / Name</TableHeader>
              <TableHeader>Value / Target</TableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800 dark:text-white/90">
                  {row.label}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ValidationPill verified={row.verified} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                  {row.type || "-"}
                </td>
                <td className="min-w-56 px-4 py-3">
                  <CopyableDnsValue label={`Copy ${row.label} host`} value={row.host} />
                </td>
                <td className="min-w-96 px-4 py-3">
                  <CopyableDnsValue label={`Copy ${row.label} value`} value={row.value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Status {status}. Last checked{" "}
        {config.lastCheckedAt
          ? new Date(config.lastCheckedAt).toLocaleString()
          : "never"}
        .
      </p>
    </div>
  );
}

function CopyableDnsValue({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all text-xs text-gray-700 dark:text-gray-300">
        {value || "-"}
      </code>
      <CopyButton label={label} value={value} />
    </div>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
      {children}
    </th>
  );
}

function ValidationPill({ verified }: { verified?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        verified
          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
          : "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
      }`}
    >
      {verified ? "Verified" : "Pending"}
    </span>
  );
}

function buildValidationRows(config: MailerSendSettings) {
  return [
    {
      key: "spf" as ValidationKey,
      label: "SPF",
      verified: config.spfVerified,
      type: "TXT",
      host: config.spfHost,
      value: config.spfValue,
    },
    {
      key: "dkim" as ValidationKey,
      label: "DKIM",
      verified: config.dkimVerified,
      type: "CNAME",
      host: config.dkimHost,
      value: config.dkimValue,
    },
    {
      key: "returnPath" as ValidationKey,
      label: "Return-path",
      verified: config.returnPathVerified,
      type: "CNAME",
      host: config.returnPathHost,
      value: config.returnPathValue,
    },
    {
      key: "tracking" as ValidationKey,
      label: "Tracking",
      verified: config.trackingVerified,
      type: "CNAME",
      host: config.trackingHost,
      value: config.trackingValue,
    },
    {
      key: "inbound" as ValidationKey,
      label: "Inbound replies",
      verified: config.inboundVerified,
      type: "MX",
      host: config.inboundMxHost,
      value: config.inboundMxPriority
        ? `${config.inboundMxPriority} ${config.inboundMxValue ?? ""}`.trim()
        : config.inboundMxValue,
    },
  ];
}
