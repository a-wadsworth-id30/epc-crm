"use client";

import { useActionState, useEffect } from "react";
import type { AttributionFeatureSettings } from "@/components/crm-boilerplate/AttributionInstallPanel";
import type { AttributionSessionSettings } from "@/components/crm-boilerplate/AttributionSessionSettingsPanel";
import { updateAttributionConsentSettingsAction } from "@/lib/actions/settings";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

export type AttributionConsentDomain = {
  id: string;
  domain: string;
  label: string | null;
  environment: string;
  isActive: boolean;
};

type AttributionConsentRequirements = {
  legalBasisConfirmed: boolean;
  privacyPolicyUpdated: boolean;
  consentBannerConnected: boolean;
  domainRegistryReviewed: boolean;
  consentPromptEnabled: boolean;
  consentPromptTitle: string | null;
  consentPromptMessage: string | null;
  consentPromptAcceptLabel: string | null;
  consentPromptDeclineLabel: string | null;
  consentPromptPrivacyUrl: string | null;
  consentPromptPlacement: string | null;
  consentPromptTheme: string | null;
  consentPromptMaxWidth: number | null;
  consentPromptBorderRadius: number | null;
  consentPromptBackgroundColor: string | null;
  consentPromptTextColor: string | null;
  consentPromptMutedTextColor: string | null;
  consentPromptBorderColor: string | null;
  consentPromptButtonBackgroundColor: string | null;
  consentPromptButtonTextColor: string | null;
  consentPromptLinkColor: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: string | null;
};

const placementOptions = [
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom centre" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top centre" },
  { value: "top-right", label: "Top right" },
];

const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Auto (visitor preference)" },
  { value: "custom", label: "Custom" },
];

export default function AttributionConsentSettingsPanel({
  consentRequirements,
  domains,
  featureSettings,
  registryUnavailable,
  sessionSettings,
}: {
  consentRequirements: unknown;
  domains: AttributionConsentDomain[];
  featureSettings: AttributionFeatureSettings;
  registryUnavailable: boolean;
  sessionSettings: AttributionSessionSettings;
}) {
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    updateAttributionConsentSettingsAction,
    {
      ok: false,
      message: "",
      savedAt: null,
    },
  );
  const activeDomains = domains.filter((domain) => domain.isActive);
  const requirements = parseConsentRequirements(consentRequirements);
  const readinessItems = [
    requirements.legalBasisConfirmed,
    requirements.privacyPolicyUpdated,
    requirements.consentBannerConnected,
    requirements.domainRegistryReviewed,
  ];
  const readinessCount = readinessItems.filter(Boolean).length;

  useEffect(() => {
    if (state.ok && state.savedAt) {
      showToast(state.message || "Consent settings saved.");
    }
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            Tracking engine
          </p>
          <div className="mt-2 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Consent settings
            </h2>
            <LazyHelpTooltip content="Explains what attribution stores in the visitor browser and whether tracking must wait for website consent." />
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Review what the attribution script stores, which features are active, and what each website needs before rollout.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Script capture" value={featureSettings.attributionTrackingEnabled ? "On" : "Off"} />
          <Metric label="Consent gate" value={featureSettings.attributionRequireConsent ? "Required" : "Optional"} />
          <Metric label="Form capture" value={featureSettings.attributionFormTrackingEnabled ? "On" : "Off"} />
          <Metric label="Built-in prompt" value={requirements.consentPromptEnabled ? "On" : "Off"} />
          <Metric label="Referrer capture" value={sessionSettings.attributionCaptureReferrerEnabled ? "On" : "Off"} />
          <Metric label="Active domains" value={registryUnavailable ? "Unavailable" : activeDomains.length.toString()} />
          <Metric label="Readiness" value={`${readinessCount}/4`} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <form
          action={formAction}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Runtime consent gate
            </h3>
            <LazyHelpTooltip content="Controls whether the website script can store IDs, inject fields, capture forms or request numbers before consent." />
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            When enabled, the website script loads its config but waits before storing IDs, injecting hidden fields, capturing forms or requesting dynamic numbers.
          </p>
          <label className="mt-5 flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <span>
              <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                Require consent before tracking
              </span>
              <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                Website banners can call window.id30Attribution.grantConsent() after opt-in and revokeConsent() after withdrawal.
              </span>
            </span>
            <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
              <input
                type="checkbox"
                name="attributionRequireConsent"
                defaultChecked={featureSettings.attributionRequireConsent}
                className="peer sr-only"
              />
              <span className="absolute inset-0 rounded-full bg-gray-200 transition peer-checked:bg-brand-500 dark:bg-white/10 dark:peer-checked:bg-brand-500" />
              <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-theme-sm transition peer-checked:translate-x-full" />
            </span>
          </label>
          <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Built-in fallback prompt
              </h4>
              <LazyHelpTooltip content="Shows a small website consent prompt from the attribution script when consent is required and the client website does not already provide one." />
            </div>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Keep this off when the client has a cookie banner or CMP. Turn it on only when the CRM script should provide the opt-in prompt.
            </p>
            <label className="mt-4 flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span>
                <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                  Show built-in prompt
                </span>
                <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Appears only when consent is required and the visitor has not already accepted or declined.
                </span>
              </span>
              <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
                <input
                  type="checkbox"
                  name="consentPromptEnabled"
                  defaultChecked={requirements.consentPromptEnabled}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-full bg-gray-200 transition peer-checked:bg-brand-500 dark:bg-white/10 dark:peer-checked:bg-brand-500" />
                <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-theme-sm transition peer-checked:translate-x-full" />
              </span>
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Prompt title
                </span>
                <input
                  name="consentPromptTitle"
                  defaultValue={requirements.consentPromptTitle ?? ""}
                  className={inputClass}
                  placeholder="Can we use cookies?"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Privacy link
                </span>
                <input
                  name="consentPromptPrivacyUrl"
                  defaultValue={requirements.consentPromptPrivacyUrl ?? ""}
                  className={inputClass}
                  placeholder="/privacy-policy"
                />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Prompt message
              </span>
              <textarea
                name="consentPromptMessage"
                defaultValue={requirements.consentPromptMessage ?? ""}
                rows={3}
                className={`${inputClass} min-h-24 py-3`}
                placeholder="We use cookies and similar technologies to improve your experience, understand site performance and measure marketing activity."
              />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Accept label
                </span>
                <input
                  name="consentPromptAcceptLabel"
                  defaultValue={requirements.consentPromptAcceptLabel ?? ""}
                  className={inputClass}
                  placeholder="Accept"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Decline label
                </span>
                <input
                  name="consentPromptDeclineLabel"
                  defaultValue={requirements.consentPromptDeclineLabel ?? ""}
                  className={inputClass}
                  placeholder="Decline"
                />
              </label>
            </div>
            <div className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <h5 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Presentation
                </h5>
                <LazyHelpTooltip content="Controls where the fallback prompt appears and the safe style values sent to the website script." />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Placement
                  </span>
                  <select
                    name="consentPromptPlacement"
                    defaultValue={requirements.consentPromptPlacement ?? "bottom-left"}
                    className={inputClass}
                  >
                    {placementOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Theme
                  </span>
                  <select
                    name="consentPromptTheme"
                    defaultValue={requirements.consentPromptTheme ?? "light"}
                    className={inputClass}
                  >
                    {themeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Max width
                  </span>
                  <input
                    type="number"
                    min={320}
                    max={720}
                    name="consentPromptMaxWidth"
                    defaultValue={requirements.consentPromptMaxWidth ?? ""}
                    className={inputClass}
                    placeholder="480"
                  />
                </label>
                <label>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Corner radius
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={32}
                    name="consentPromptBorderRadius"
                    defaultValue={requirements.consentPromptBorderRadius ?? ""}
                    className={inputClass}
                    placeholder="12"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ColorField
                  label="Panel background"
                  name="consentPromptBackgroundColor"
                  placeholder="#ffffff"
                  value={requirements.consentPromptBackgroundColor}
                />
                <ColorField
                  label="Main text"
                  name="consentPromptTextColor"
                  placeholder="#111827"
                  value={requirements.consentPromptTextColor}
                />
                <ColorField
                  label="Body text"
                  name="consentPromptMutedTextColor"
                  placeholder="#4b5563"
                  value={requirements.consentPromptMutedTextColor}
                />
                <ColorField
                  label="Border"
                  name="consentPromptBorderColor"
                  placeholder="#e5e7eb"
                  value={requirements.consentPromptBorderColor}
                />
                <ColorField
                  label="Accept background"
                  name="consentPromptButtonBackgroundColor"
                  placeholder="#111827"
                  value={requirements.consentPromptButtonBackgroundColor}
                />
                <ColorField
                  label="Accept text"
                  name="consentPromptButtonTextColor"
                  placeholder="#ffffff"
                  value={requirements.consentPromptButtonTextColor}
                />
                <ColorField
                  label="Link colour"
                  name="consentPromptLinkColor"
                  placeholder="#2563eb"
                  value={requirements.consentPromptLinkColor}
                />
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Client rollout requirements
              </h4>
              <LazyHelpTooltip content="Records operational sign-off points for the client website. This does not replace legal advice." />
            </div>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Capture the client-specific decisions that should be confirmed before production tracking is enabled.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <RequirementCheckbox
                defaultChecked={requirements.legalBasisConfirmed}
                detail="The client has confirmed the legal basis or consent requirement for attribution tracking."
                name="legalBasisConfirmed"
                title="Legal basis confirmed"
              />
              <RequirementCheckbox
                defaultChecked={requirements.privacyPolicyUpdated}
                detail="The website privacy policy describes attribution storage, click IDs, form capture and phone tracking where used."
                name="privacyPolicyUpdated"
                title="Privacy policy updated"
              />
              <RequirementCheckbox
                defaultChecked={requirements.consentBannerConnected}
                detail="The website consent banner is wired to grantConsent and revokeConsent where opt-in is required."
                name="consentBannerConnected"
                title="Consent banner connected"
              />
              <RequirementCheckbox
                defaultChecked={requirements.domainRegistryReviewed}
                detail="Production, staging and microsite domains have been reviewed in the Attribution Domains registry."
                name="domainRegistryReviewed"
                title="Domain registry reviewed"
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Reviewed by
                </span>
                <input
                  name="reviewedBy"
                  defaultValue={requirements.reviewedBy ?? ""}
                  className={inputClass}
                  placeholder="Name or role"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Review date
                </span>
                <input
                  type="date"
                  name="reviewedAt"
                  defaultValue={dateInputValue(requirements.reviewedAt)}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Notes
              </span>
              <textarea
                name="notes"
                defaultValue={requirements.notes ?? ""}
                rows={4}
                className={`${inputClass} min-h-28 py-3`}
                placeholder="Record client-specific consent notes, banner dependency, privacy policy link or sign-off reference."
              />
            </label>
          </div>
          <CodeBlock
            code={`window.id30Attribution.grantConsent();\nwindow.id30Attribution.revokeConsent();\nwindow.id30Attribution.hasConsent();`}
          />
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ActionStateMessage state={state.ok ? undefined : state} />
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save consent settings"}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Current behaviour
            </h3>
            <LazyHelpTooltip content="Summarises what the attribution script does today when tracking is enabled for an approved domain." />
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            The script runs when installed, the domain is allowed, and attribution is enabled in Feature Controls.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <BehaviourCard
              title="First-party storage"
              detail="Visitor ID, session ID and attribution payload are stored in the website visitor browser."
            />
            <BehaviourCard
              title="No CRM cookie"
              detail="The attribution script uses browser storage, not the CRM login session cookie."
            />
            <BehaviourCard
              title="Form attribution"
              detail="Hidden attribution fields can be injected into forms when enabled."
            />
            <BehaviourCard
              title="Phone tracking"
              detail="Dynamic numbers may be requested and swapped into tel links or visible number text."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Browser storage
            </h3>
            <LazyHelpTooltip content="Shows the browser storage keys used to persist attribution payloads, visitor IDs and session IDs." />
          </div>
          <div className="mt-4 space-y-3">
            <StorageRow label="Attribution payload" storage="localStorage" storageKey="id30_attribution" />
            <StorageRow label="Visitor ID" storage="localStorage" storageKey="id30_visitor_id" />
            <StorageRow label="Session ID" storage="sessionStorage" storageKey="id30_session_id" />
          </div>
          <p className="mt-4 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Timeline retention is capped at {sessionSettings.attributionTimelineLimit} touchpoints. Dynamic number assignments last {sessionSettings.attributionSessionTimeoutMinutes} minutes.
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Rollout checklist
            </h3>
            <LazyHelpTooltip content="Guides users through the privacy and consent steps to complete before installing tracking on a client website." />
          </div>
          <div className="mt-5 space-y-3">
            <ChecklistItem title="Confirm legal basis" detail="Confirm client-specific consent requirements before enabling tracking on a website." />
            <ChecklistItem title="Update privacy policy" detail="Include visitor/session identifiers, attribution payloads, UTM capture and phone tracking where used." />
            <ChecklistItem title="Connect consent banner" detail="If opt-in is required, call grantConsent after acceptance and revokeConsent after withdrawal." />
            <ChecklistItem title="Register domains" detail="Keep the domain registry active so unapproved websites cannot receive enabled script settings." />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Domain readiness
              </h3>
              <LazyHelpTooltip content="Shows which registered domains are ready for attribution rollout and consent-banner coordination." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Consent requirements are handled on each client website before the CRM script is installed.
            </p>
          </div>
          {registryUnavailable ? (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
              Domain registry is unavailable. Run production migrations before reviewing domain rollout readiness.
            </p>
          ) : domains.length ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {domains.map((domain) => (
                <DomainRow key={domain.id} domain={domain} />
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
              No attribution domains have been added yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function BehaviourCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
      <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function StorageRow({
  label,
  storage,
  storageKey,
}: {
  label: string;
  storage: string;
  storageKey: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{label}</p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          {storage}
        </span>
      </div>
      <code className="mt-2 block truncate text-xs font-semibold text-gray-600 dark:text-gray-300">
        {storageKey}
      </code>
    </div>
  );
}

function ChecklistItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
      <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function RequirementCheckbox({
  defaultChecked,
  detail,
  name,
  title,
}: {
  defaultChecked: boolean;
  detail: string;
  name: string;
  title: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
      />
      <span>
        <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
          {title}
        </span>
        <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
          {detail}
        </span>
      </span>
    </label>
  );
}

function ColorField({
  label,
  name,
  placeholder,
  value,
}: {
  label: string;
  name: string;
  placeholder: string;
  value: string | null;
}) {
  const swatch = value && isHexColor(value) ? value : placeholder;

  return (
    <label>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <span className="mt-2 flex items-center gap-2">
        <span
          className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: swatch }}
        />
        <input
          name={name}
          defaultValue={value ?? ""}
          className={colorInputClass}
          placeholder={placeholder}
        />
      </span>
    </label>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-gray-950 p-4 text-xs leading-6 text-gray-100 dark:border-gray-800">
      <code>{code}</code>
    </pre>
  );
}

const inputClass =
  "mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";
const colorInputClass =
  "h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

function parseConsentRequirements(value: unknown): AttributionConsentRequirements {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<AttributionConsentRequirements>)
      : {};

  return {
    legalBasisConfirmed: record.legalBasisConfirmed === true,
    privacyPolicyUpdated: record.privacyPolicyUpdated === true,
    consentBannerConnected: record.consentBannerConnected === true,
    domainRegistryReviewed: record.domainRegistryReviewed === true,
    consentPromptEnabled: record.consentPromptEnabled === true,
    consentPromptTitle: stringOrNull(record.consentPromptTitle),
    consentPromptMessage: stringOrNull(record.consentPromptMessage),
    consentPromptAcceptLabel: stringOrNull(record.consentPromptAcceptLabel),
    consentPromptDeclineLabel: stringOrNull(record.consentPromptDeclineLabel),
    consentPromptPrivacyUrl: stringOrNull(record.consentPromptPrivacyUrl),
    consentPromptPlacement: placementOrNull(record.consentPromptPlacement),
    consentPromptTheme: themeOrNull(record.consentPromptTheme),
    consentPromptMaxWidth: numberOrNull(record.consentPromptMaxWidth),
    consentPromptBorderRadius: numberOrNull(record.consentPromptBorderRadius),
    consentPromptBackgroundColor: hexColorOrNull(record.consentPromptBackgroundColor),
    consentPromptTextColor: hexColorOrNull(record.consentPromptTextColor),
    consentPromptMutedTextColor: hexColorOrNull(record.consentPromptMutedTextColor),
    consentPromptBorderColor: hexColorOrNull(record.consentPromptBorderColor),
    consentPromptButtonBackgroundColor: hexColorOrNull(
      record.consentPromptButtonBackgroundColor,
    ),
    consentPromptButtonTextColor: hexColorOrNull(record.consentPromptButtonTextColor),
    consentPromptLinkColor: hexColorOrNull(record.consentPromptLinkColor),
    reviewedBy: stringOrNull(record.reviewedBy),
    reviewedAt: stringOrNull(record.reviewedAt),
    notes: stringOrNull(record.notes),
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function placementOrNull(value: unknown) {
  return typeof value === "string" &&
    placementOptions.some((option) => option.value === value)
    ? value
    : null;
}

function themeOrNull(value: unknown) {
  return typeof value === "string" && themeOptions.some((option) => option.value === value)
    ? value
    : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function hexColorOrNull(value: unknown) {
  return typeof value === "string" && isHexColor(value) ? value : null;
}

function isHexColor(value: string) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

function dateInputValue(value: string | null) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

function DomainRow({ domain }: { domain: AttributionConsentDomain }) {
  return (
    <div className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {domain.label || domain.domain}
          </p>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {domain.environment}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
          {domain.domain}
        </p>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          domain.isActive
            ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
            : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
        }`}
      >
        {domain.isActive ? "Active" : "Inactive"}
      </span>
    </div>
  );
}
