"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import DeferredActionLoader from "@/components/crm-boilerplate/DeferredActionLoader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import type { IntegrationPlaceholderSwitchProps } from "@/components/crm-boilerplate/IntegrationPlaceholderSwitch";
import type { IntegrationSettingsDialogProps } from "@/components/crm-boilerplate/IntegrationSettingsDialog";
import { ExternalLink } from "lucide-react";

const LoadedIntegrationSettingsDialog = dynamic<IntegrationSettingsDialogProps>(
  () =>
    import("@/components/crm-boilerplate/IntegrationSettingsDialog").then(
      (module) => module.IntegrationSettingsDialog,
    ),
  {
    ssr: false,
    loading: () => (
      <IntegrationSettingsTrigger
        ariaLabel="Loading integration settings"
        disabled
        onOpen={() => undefined}
      />
    ),
  },
);

const LoadedIntegrationPlaceholderSwitch =
  dynamic<IntegrationPlaceholderSwitchProps>(
    () =>
      import("@/components/crm-boilerplate/IntegrationPlaceholderSwitch").then(
        (module) => module.IntegrationPlaceholderSwitch,
      ),
    {
      ssr: false,
      loading: () => (
        <span className="h-6 w-11 rounded-full bg-gray-100 dark:bg-white/10" />
      ),
    },
  );

export type IntegrationCardProps = {
  name: string;
  provider: string;
  description: string;
  status: "CONNECTED" | "NOT_CONNECTED" | "ERROR";
  iconSrc: string;
  appBaseUrl?: string;
  bootstrapUrl?: string;
  callbackUrl?: string;
  categoryLabel?: string;
  capabilities?: Array<{
    detail: string;
    label: string;
    optional?: boolean;
    status: "missing" | "ready" | "warning";
  }>;
  config?: IntegrationSettingsDialogProps["config"];
  credentialSource?: "database" | "environment" | "missing" | "placeholder";
  hasStoredCredentials?: boolean;
  hasEncryptionKey?: boolean;
  internal?: boolean;
  latestHealthSnapshot?: {
    capability: string;
    checkedAt: string;
    message: string | null;
    provider: string;
    source: string;
    status: "ERROR" | "READY" | "UNKNOWN" | "WARNING";
  } | null;
  readinessStatus?:
    | "connected"
    | "error"
    | "missing"
    | "partial"
    | "placeholder";
  canEdit?: boolean;
  setupHref?: string;
};

function CogIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.64615 4.59906C5.05459 4.25752 4.29808 4.46015 3.95654 5.05171L2.69321 7.23986C2.35175 7.83128 2.5544 8.58754 3.14582 8.92899C3.97016 9.40493 3.97017 10.5948 3.14583 11.0707C2.55441 11.4122 2.35178 12.1684 2.69323 12.7598L3.95657 14.948C4.2981 15.5395 5.05461 15.7422 5.64617 15.4006C6.4706 14.9247 7.50129 15.5196 7.50129 16.4715C7.50129 17.1545 8.05496 17.7082 8.73794 17.7082H11.2649C11.9478 17.7082 12.5013 17.1545 12.5013 16.4717C12.5013 15.5201 13.5315 14.9251 14.3556 15.401C14.9469 15.7423 15.7029 15.5397 16.0443 14.9485L17.3079 12.7598C17.6494 12.1684 17.4467 11.4121 16.8553 11.0707C16.031 10.5948 16.031 9.40494 16.8554 8.92902C17.4468 8.58757 17.6494 7.83133 17.3079 7.23992L16.0443 5.05123C15.7029 4.45996 14.9469 4.25737 14.3556 4.59874C13.5315 5.07456 12.5013 4.47961 12.5013 3.52798C12.5013 2.84515 11.9477 2.2915 11.2649 2.2915L8.73795 2.2915C8.05496 2.2915 7.50129 2.84518 7.50129 3.52816C7.50129 4.48015 6.47059 5.07505 5.64615 4.59906Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M12.5714 9.99977C12.5714 11.4196 11.4204 12.5706 10.0005 12.5706C8.58069 12.5706 7.42969 11.4196 7.42969 9.99977C7.42969 8.57994 8.58069 7.42894 10.0005 7.42894C11.4204 7.42894 12.5714 8.57994 12.5714 9.99977Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default function IntegrationCard({
  name,
  provider,
  description,
  status,
  iconSrc,
  appBaseUrl = "",
  bootstrapUrl = "/api/integrations/id30-auth/bootstrap/start",
  callbackUrl = "",
  categoryLabel,
  capabilities = [],
  config = {},
  credentialSource = "missing",
  hasStoredCredentials = false,
  hasEncryptionKey = false,
  internal = false,
  latestHealthSnapshot = null,
  readinessStatus = "missing",
  canEdit = false,
  setupHref = "",
}: IntegrationCardProps) {
  const effectiveEnabled =
    status === "CONNECTED" ||
    credentialSource === "environment" ||
    readinessStatus === "partial";
  const [enabled, setEnabled] = useState(effectiveEnabled);
  const isCloudflareR2 = provider === "cloudflare-r2";
  const isDocuSign = provider === "docusign";
  const isGeoapify = provider === "geoapify";
  const isMailerSend = provider === "mailersend";
  const isTwilio = provider === "twilio";
  const isOpenAI = provider === "openai";
  const isPipedrive = provider === "pipedrive";
  const isSpruce = provider === "spruce";
  const isId30Auth = provider === "id30-auth";
  const isRealIntegration =
    isCloudflareR2 ||
    isDocuSign ||
    isGeoapify ||
    isId30Auth ||
    isMailerSend ||
    isOpenAI ||
    isPipedrive ||
    isSpruce ||
    isTwilio;
  const displayStatus =
    status === "ERROR" || readinessStatus === "error"
      ? "Error"
      : readinessStatus === "partial"
        ? "Partial"
        : credentialSource === "environment"
          ? "Env Configured"
          : enabled
            ? "Connected"
            : "Not Connected";
  const credentialDetail =
    credentialSource === "environment"
      ? "Configured via environment variables."
      : hasStoredCredentials
        ? readinessStatus === "partial"
          ? "Credentials saved. Some capabilities need setup."
          : "Credentials saved in the database."
        : credentialSource === "placeholder"
          ? "Planned integration. Credentials are not active yet."
          : "Credentials missing.";
  const serviceLabel =
    categoryLabel ??
    (isCloudflareR2
      ? "Storage"
      : isDocuSign
        ? "Documents"
        : isGeoapify
          ? "CRM data"
          : isOpenAI
            ? "AI"
            : isId30Auth
              ? "Marketing"
              : "Communications");

  useEffect(() => {
    setEnabled(effectiveEnabled);
  }, [effectiveEnabled]);

  return (
    <>
      <article className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="p-5 pb-9">
          <div className="mb-5 inline-flex h-10 w-10 items-center justify-center">
            <Image
              className="h-8 w-8 object-contain"
              src={iconSrc}
              alt=""
              width={32}
              height={32}
            />
          </div>
          <div className="mb-3 flex items-start justify-between gap-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {name}
            </h3>
            <StatusBadge>{displayStatus}</StatusBadge>
          </div>
          <p className="max-w-xs text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
          <p className="mt-3 text-xs font-medium text-gray-500 dark:text-gray-400">
            {credentialDetail}
          </p>
          {latestHealthSnapshot ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Last check:{" "}
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {healthSnapshotLabel(latestHealthSnapshot.status)}
              </span>{" "}
              {formatHealthCheckedAt(latestHealthSnapshot.checkedAt)}
            </p>
          ) : null}
          {capabilities.length ? (
            <dl className="mt-4 space-y-2">
              {capabilities.slice(0, 4).map((capability) => (
                <div
                  key={capability.label}
                  className="flex gap-2 text-xs leading-5"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${capabilityDotClass(
                      capability.status,
                    )}`}
                  />
                  <div className="min-w-0">
                    <dt className="flex flex-wrap items-center gap-x-2 font-medium text-gray-700 dark:text-gray-200">
                      <span>{capability.label}</span>
                      <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                        {capabilityStatusLabel(capability)}
                      </span>
                    </dt>
                    <dd className="text-gray-500 dark:text-gray-400">
                      {capability.detail}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 p-5 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2">
            <DeferredActionLoader
              renderTrigger={(open) => (
                <IntegrationSettingsTrigger
                  ariaLabel={`Open ${name} settings`}
                  onOpen={open}
                />
              )}
            >
              {(autoOpen) => (
                <LoadedIntegrationSettingsDialog
                  appBaseUrl={appBaseUrl}
                  autoOpen={autoOpen}
                  bootstrapUrl={bootstrapUrl}
                  callbackUrl={callbackUrl}
                  canEdit={canEdit}
                  config={config}
                  credentialSource={credentialSource}
                  hasEncryptionKey={hasEncryptionKey}
                  hasStoredCredentials={hasStoredCredentials}
                  name={name}
                  onSaved={setEnabled}
                  provider={provider}
                />
              )}
            </DeferredActionLoader>
            {setupHref ? (
              <Link
                href={setupHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 shadow-theme-xs transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Full setup
              </Link>
            ) : null}
          </div>
          {isRealIntegration ? (
            <div className="flex items-center gap-2">
              {internal ? (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                  Internal
                </span>
              ) : null}
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
                {serviceLabel}
              </span>
            </div>
          ) : (
            <LoadedIntegrationPlaceholderSwitch
              defaultChecked={enabled}
              onChange={setEnabled}
              name={name}
              disabled={status === "ERROR"}
            />
          )}
        </div>
      </article>
    </>
  );
}

function capabilityDotClass(
  status: NonNullable<IntegrationCardProps["capabilities"]>[number]["status"],
) {
  if (status === "ready") return "bg-success-500";
  if (status === "warning") return "bg-warning-500";

  return "bg-error-500";
}

function capabilityStatusLabel(
  capability: NonNullable<IntegrationCardProps["capabilities"]>[number],
) {
  if (capability.status === "ready") return "Ready";
  if (capability.optional) return "Optional";

  return "Needed";
}

function formatHealthCheckedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function healthSnapshotLabel(
  status: NonNullable<IntegrationCardProps["latestHealthSnapshot"]>["status"],
) {
  if (status === "READY") return "Ready";
  if (status === "WARNING") return "Check";
  if (status === "ERROR") return "Error";

  return "Unknown";
}

function IntegrationSettingsTrigger({
  ariaLabel,
  disabled = false,
  onOpen,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 text-gray-700 shadow-theme-xs transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
    >
      <CogIcon />
    </button>
  );
}
