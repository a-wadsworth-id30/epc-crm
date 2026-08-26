"use client";

import dynamic from "next/dynamic";

function IntegrationFormLoading() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-48 rounded bg-gray-100 dark:bg-white/[0.08]" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-11 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-11 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
      </div>
      <div className="h-24 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
    </div>
  );
}

export const BingAdsIntegrationForm = dynamic(
  () => import("@/components/crm-boilerplate/BingAdsIntegrationForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const CloudflareR2SettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/CloudflareR2SettingsForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const DocuSignSettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/DocuSignSettingsForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const GoogleAdsIntegrationForm = dynamic(
  () => import("@/components/crm-boilerplate/GoogleAdsIntegrationForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const GoogleAnalyticsIntegrationForm = dynamic(
  () => import("@/components/crm-boilerplate/GoogleAnalyticsIntegrationForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const GeoapifySettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/GeoapifySettingsForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const GoogleSearchConsoleIntegrationForm = dynamic(
  () =>
    import("@/components/crm-boilerplate/GoogleSearchConsoleIntegrationForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const Id30AuthSettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/Id30AuthSettingsForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const KlaviyoIntegrationForm = dynamic(
  () => import("@/components/crm-boilerplate/KlaviyoIntegrationForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const LinkedInAdsIntegrationForm = dynamic(
  () => import("@/components/crm-boilerplate/LinkedInAdsIntegrationForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const MailerSendSettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/MailerSendSettingsForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const MetaIntegrationForm = dynamic(
  () => import("@/components/crm-boilerplate/MetaIntegrationForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const OpenAISettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/OpenAISettingsForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const PipedriveSettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/PipedriveSettingsForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const SpruceZapierSettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/SpruceZapierSettingsForm"),
  { loading: IntegrationFormLoading, ssr: false },
);

export const TwilioSettingsForm = dynamic(
  () => import("@/components/crm-boilerplate/TwilioSettingsForm"),
  { loading: IntegrationFormLoading, ssr: false },
);
