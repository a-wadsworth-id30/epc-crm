"use client";

import { useEffect } from "react";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import type { CloudflareR2Settings } from "@/components/crm-boilerplate/CloudflareR2SettingsForm";
import type { DocuSignSettings } from "@/components/crm-boilerplate/DocuSignSettingsForm";
import type { GeoapifySettings } from "@/components/crm-boilerplate/GeoapifySettingsForm";
import type { Id30AuthPublicSettings } from "@/components/crm-boilerplate/Id30AuthSettingsForm";
import {
  CloudflareR2SettingsForm,
  DocuSignSettingsForm,
  GeoapifySettingsForm,
  Id30AuthSettingsForm,
  MailerSendSettingsForm,
  OpenAISettingsForm,
  PipedriveSettingsForm,
  TwilioSettingsForm,
} from "@/components/crm-boilerplate/LazyIntegrationForms";
import type { MailerSendSettings } from "@/components/crm-boilerplate/MailerSendSettingsForm";
import type { OpenAISettings } from "@/components/crm-boilerplate/OpenAISettingsForm";
import type { PipedriveSettings } from "@/components/crm-boilerplate/PipedriveSettingsForm";
import type { TwilioSettings } from "@/components/crm-boilerplate/TwilioSettingsForm";

export type IntegrationSettingsDialogProps = {
  appBaseUrl?: string;
  autoOpen?: boolean;
  bootstrapUrl?: string;
  callbackUrl?: string;
  canEdit?: boolean;
  config?:
    | CloudflareR2Settings
    | DocuSignSettings
    | GeoapifySettings
    | Id30AuthPublicSettings
    | MailerSendSettings
    | OpenAISettings
    | PipedriveSettings
    | TwilioSettings;
  credentialSource?: "database" | "environment" | "missing" | "placeholder";
  hasEncryptionKey?: boolean;
  hasStoredCredentials?: boolean;
  name: string;
  onSaved: (enabled: boolean) => void;
  provider: string;
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

export function IntegrationSettingsDialog({
  appBaseUrl = "",
  autoOpen = false,
  bootstrapUrl = "/api/integrations/id30-auth/bootstrap/start",
  callbackUrl = "",
  canEdit = false,
  config = {},
  credentialSource = "missing",
  hasEncryptionKey = false,
  hasStoredCredentials = false,
  name,
  onSaved,
  provider,
}: IntegrationSettingsDialogProps) {
  const settingsModal = useModal();
  const { openModal } = settingsModal;
  const isCloudflareR2 = provider === "cloudflare-r2";
  const isDocuSign = provider === "docusign";
  const isGeoapify = provider === "geoapify";
  const isMailerSend = provider === "mailersend";
  const isTwilio = provider === "twilio";
  const isOpenAI = provider === "openai";
  const isPipedrive = provider === "pipedrive";
  const isId30Auth = provider === "id30-auth";

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  return (
    <>
      <button
        type="button"
        onClick={settingsModal.openModal}
        aria-label={`Open ${name} settings`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 text-gray-700 shadow-theme-xs transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
      >
        <CogIcon />
      </button>

      <Modal
        isOpen={settingsModal.isOpen}
        onClose={settingsModal.closeModal}
        className="relative w-full max-w-[680px] rounded-3xl bg-white p-6 lg:p-10 dark:bg-gray-900"
      >
        <div>
          <h4 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            {name} settings
          </h4>
          <p className="mb-7 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {isCloudflareR2
              ? "Configure the R2 bucket used for CRM file storage."
              : isDocuSign
                ? "Configure DocuSign electronic signature for CRM documents."
                : isGeoapify
                  ? "Configure Geoapify address lookup for CRM address fields."
                  : isId30Auth
                    ? "Internal iD30 broker provisioning for marketing provider logins."
                    : isMailerSend
                      ? "Configure MailerSend email delivery, DNS and inbound routing."
                      : isOpenAI
                        ? "Configure OpenAI credentials for Sidekick and AI-assisted CRM workflows."
                        : isPipedrive
                          ? "Configure Pipedrive credentials for CRM lead imports."
                          : isTwilio
                            ? "Configure Twilio credentials for telephony, SMS and WhatsApp."
                            : "Configure the placeholder connection details for this CRM integration."}
          </p>
          {isCloudflareR2 ? (
            <CloudflareR2SettingsForm
              config={config as CloudflareR2Settings}
              hasStoredCredentials={hasStoredCredentials}
              hasEncryptionKey={hasEncryptionKey}
              canEdit={canEdit}
              mode="connection"
              onSaved={onSaved}
            />
          ) : isGeoapify ? (
            <GeoapifySettingsForm
              config={config as GeoapifySettings}
              hasStoredCredentials={hasStoredCredentials}
              credentialSource={credentialSource}
              hasEncryptionKey={hasEncryptionKey}
              canEdit={canEdit}
              onSaved={onSaved}
            />
          ) : isDocuSign ? (
            <DocuSignSettingsForm
              config={config as DocuSignSettings}
              hasStoredCredentials={hasStoredCredentials}
              hasEncryptionKey={hasEncryptionKey}
              canEdit={canEdit}
              onSaved={onSaved}
            />
          ) : isId30Auth ? (
            <Id30AuthSettingsForm
              appBaseUrl={appBaseUrl}
              bootstrapUrl={bootstrapUrl}
              callbackUrl={callbackUrl}
              config={config as Id30AuthPublicSettings}
              hasStoredCredentials={hasStoredCredentials}
              credentialSource={credentialSource}
              hasEncryptionKey={hasEncryptionKey}
              canEdit={canEdit}
              onSaved={onSaved}
            />
          ) : isOpenAI ? (
            <OpenAISettingsForm
              config={config as OpenAISettings}
              hasStoredCredentials={hasStoredCredentials}
              credentialSource={credentialSource}
              hasEncryptionKey={hasEncryptionKey}
              canEdit={canEdit}
              onSaved={onSaved}
            />
          ) : isPipedrive ? (
            <PipedriveSettingsForm
              config={config as PipedriveSettings}
              hasStoredCredentials={hasStoredCredentials}
              credentialSource={credentialSource}
              hasEncryptionKey={hasEncryptionKey}
              canEdit={canEdit}
              onSaved={onSaved}
            />
          ) : isTwilio ? (
            <TwilioSettingsForm
              config={config as TwilioSettings}
              hasStoredCredentials={hasStoredCredentials}
              hasEncryptionKey={hasEncryptionKey}
              canEdit={canEdit}
              mode="connection"
              onSaved={onSaved}
            />
          ) : isMailerSend ? (
            <MailerSendSettingsForm
              config={config as MailerSendSettings}
              hasStoredCredentials={hasStoredCredentials}
              hasEncryptionKey={hasEncryptionKey}
              canEdit={canEdit}
              onSaved={onSaved}
            />
          ) : (
            <>
              <form action="#">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                      Provider
                    </label>
                    <input
                      type="text"
                      value={provider}
                      disabled
                      className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 shadow-theme-xs disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                      API key
                    </label>
                    <input
                      type="text"
                      placeholder="Add encrypted credential storage before use"
                      disabled
                      className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 shadow-theme-xs disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                      Webhook URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://example.com/webhook"
                      disabled
                      className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 shadow-theme-xs disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                    />
                  </div>
                </div>
              </form>
              <div className="mt-8 flex w-full flex-col items-center justify-between gap-3 sm:flex-row">
                <Button
                  onClick={settingsModal.closeModal}
                  className="w-full"
                  variant="outline"
                >
                  Close
                </Button>
                <Button className="w-full" disabled>
                  Save Changes
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
