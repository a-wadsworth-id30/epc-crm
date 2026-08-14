"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { updateCompanyProfileAction } from "@/lib/actions/settings";
import {
  getCompanyBrandStyle,
  getCompanyLogoUrl,
  normalizeCompanyBrandColor,
  type CompanyProfile,
} from "@/lib/company-profile";

const initialState = {
  ok: false,
  message: "",
  savedAt: null,
  profile: null,
};

const fileInputClassName =
  "block w-full cursor-pointer rounded-lg border border-gray-300 bg-transparent text-sm text-gray-700 shadow-theme-xs file:mr-4 file:border-0 file:bg-gray-100 file:px-4 file:py-3 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:file:bg-white/[0.06] dark:file:text-gray-200";
const textInputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 dark:disabled:bg-white/[0.03]";
const textareaClassName =
  "min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 dark:disabled:bg-white/[0.03]";

const brandColorFallbacks = {
  brandAccentColor: "#7a5af8",
  brandPrimaryColor: "#465fff",
  darkBrandPrimaryColor: "#7592ff",
  lightBrandPrimaryColor: "#465fff",
};

type LogoPreviewKey = "darkLogo" | "defaultLogo" | "lightLogo";
type BrandColorKey = keyof typeof brandColorFallbacks;
type BrandColorValues = Record<BrandColorKey, string>;

type SelectedLogoPreview = {
  name: string;
  url: string;
};

type SelectedLogoPreviews = Record<LogoPreviewKey, SelectedLogoPreview | null>;

function createEmptyLogoPreviews(): SelectedLogoPreviews {
  return {
    darkLogo: null,
    defaultLogo: null,
    lightLogo: null,
  };
}

function revokeLogoPreviews(previews: SelectedLogoPreviews) {
  Object.values(previews).forEach((preview) => {
    if (preview) URL.revokeObjectURL(preview.url);
  });
}

function createBrandColorValues(profile: CompanyProfile): BrandColorValues {
  return {
    brandAccentColor: profile.brandAccentColor ?? "",
    brandPrimaryColor: profile.brandPrimaryColor ?? "",
    darkBrandPrimaryColor: profile.darkBrandPrimaryColor ?? "",
    lightBrandPrimaryColor: profile.lightBrandPrimaryColor ?? "",
  };
}

function getColorInputValue(value: string, fallback: string) {
  return normalizeCompanyBrandColor(value) ?? fallback;
}

function LogoUploadField({
  description,
  disabled,
  id,
  label,
  name,
  onChange,
}: {
  description: string;
  disabled: boolean;
  id: string;
  label: string;
  name: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
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
        type="file"
        accept="image/svg+xml,.svg,image/*"
        disabled={disabled}
        onChange={onChange}
        className={fileInputClassName}
      />
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}

function RemoveLogoCheckbox({
  disabled,
  label,
  name,
  show,
}: {
  disabled: boolean;
  label: string;
  name: string;
  show: boolean;
}) {
  if (!show) return null;

  return (
    <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">
      <input
        type="checkbox"
        name={name}
        disabled={disabled}
        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 disabled:cursor-not-allowed"
      />
      {label}
    </label>
  );
}

function BrandColorField({
  description,
  disabled,
  fallback,
  id,
  label,
  name,
  onChange,
  value,
}: {
  description: string;
  disabled: boolean;
  fallback: string;
  id: string;
  label: string;
  name: BrandColorKey;
  onChange: (key: BrandColorKey, value: string) => void;
  value: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
      >
        {label}
      </label>
      <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white shadow-theme-xs focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:focus-within:border-brand-800">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={getColorInputValue(value, fallback)}
          disabled={disabled}
          onChange={(event) => onChange(name, event.currentTarget.value)}
          className="h-11 w-12 shrink-0 cursor-pointer border-0 bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          id={id}
          name={name}
          type="text"
          value={value}
          placeholder={fallback}
          pattern="#[0-9a-fA-F]{6}"
          title="Use a 6-digit hex colour, for example #465fff."
          disabled={disabled}
          onChange={(event) => onChange(name, event.currentTarget.value)}
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:text-white/90 dark:placeholder:text-white/30 dark:disabled:bg-white/[0.03]"
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}

function CompanyTextField({
  autoComplete,
  disabled,
  id,
  label,
  name,
  placeholder,
  type = "text",
  value,
}: {
  autoComplete?: string;
  disabled: boolean;
  id: string;
  label: string;
  name: keyof CompanyProfile;
  placeholder?: string;
  type?: "email" | "tel" | "text" | "url";
  value: string | null;
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
        autoComplete={autoComplete}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        className={textInputClassName}
      />
    </div>
  );
}

function CompanyTextareaField({
  disabled,
  id,
  label,
  name,
  placeholder,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  name: keyof CompanyProfile;
  placeholder?: string;
  value: string | null;
}) {
  return (
    <div className="xl:col-span-2">
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
      >
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        className={textareaClassName}
      />
    </div>
  );
}

function BrandThemePreview({ profile }: { profile: CompanyProfile }) {
  const brandStyle = getCompanyBrandStyle(profile) as
    | CSSProperties
    | undefined;
  const accentSwatchStyle = {
    backgroundColor: "var(--id30-company-active-brand-accent)",
  } as CSSProperties;

  return (
    <div className="grid gap-3">
      <div
        data-company-brand=""
        style={brandStyle}
        className="rounded-xl border border-gray-200 bg-white p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-gray-500">
            Light theme
          </span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            Brand badge
          </span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white shadow-theme-xs"
          >
            Primary action
          </button>
          <span className="h-8 w-8 rounded-full bg-brand-100 ring-4 ring-brand-50" />
          <span
            className="h-8 w-8 rounded-full ring-4 ring-gray-100"
            style={accentSwatchStyle}
          />
        </div>
      </div>

      <div className="dark">
        <div
          data-company-brand=""
          style={brandStyle}
          className="rounded-xl border border-gray-800 bg-gray-950 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-gray-400">
              Dark theme
            </span>
            <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
              Brand badge
            </span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white shadow-theme-xs"
            >
              Primary action
            </button>
            <span className="h-8 w-8 rounded-full bg-brand-900 ring-4 ring-brand-500/20" />
            <span
              className="h-8 w-8 rounded-full ring-4 ring-white/10"
              style={accentSwatchStyle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function logoSourceLabel(
  profile: CompanyProfile,
  mode: "dark" | "light",
  selectedPreviews: SelectedLogoPreviews,
) {
  if (mode === "light") {
    if (selectedPreviews.lightLogo) {
      return `Selected: ${selectedPreviews.lightLogo.name}`;
    }

    if (profile.lightLogoOriginalName) return profile.lightLogoOriginalName;
    if (selectedPreviews.defaultLogo) {
      return `Selected fallback: ${selectedPreviews.defaultLogo.name}`;
    }

    if (profile.logoOriginalName) return `Fallback: ${profile.logoOriginalName}`;
    if (selectedPreviews.darkLogo) {
      return `Selected fallback: ${selectedPreviews.darkLogo.name}`;
    }

    if (profile.darkLogoOriginalName) {
      return `Fallback: ${profile.darkLogoOriginalName}`;
    }

    return "Default light logo";
  }

  if (selectedPreviews.darkLogo) {
    return `Selected: ${selectedPreviews.darkLogo.name}`;
  }

  if (profile.darkLogoOriginalName) return profile.darkLogoOriginalName;
  if (selectedPreviews.defaultLogo) {
    return `Selected fallback: ${selectedPreviews.defaultLogo.name}`;
  }

  if (profile.logoOriginalName) return `Fallback: ${profile.logoOriginalName}`;
  if (selectedPreviews.lightLogo) {
    return `Selected fallback: ${selectedPreviews.lightLogo.name}`;
  }

  if (profile.lightLogoOriginalName) {
    return `Fallback: ${profile.lightLogoOriginalName}`;
  }

  return "Default dark logo";
}

function LogoPreview({
  mode,
  profile,
}: {
  mode: "dark" | "light";
  profile: CompanyProfile;
}) {
  const logoUrl = getCompanyLogoUrl(profile, mode);
  const defaultSrc =
    mode === "dark" ? "/images/logo/logo-dark.svg" : "/images/logo/logo.svg";

  return (
    <div
      className={
        mode === "dark"
          ? "rounded-xl border border-gray-800 bg-gray-950 p-4"
          : "rounded-xl border border-gray-200 bg-white p-4"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl ?? defaultSrc}
        alt={`${profile.organizationName} ${mode} mode logo preview`}
        className={`h-10 max-w-[200px] object-contain ${
          !logoUrl && mode === "dark" ? "invert" : ""
        }`}
      />
      <p
        className={
          mode === "dark"
            ? "mt-3 text-xs font-medium text-gray-400"
            : "mt-3 text-xs font-medium text-gray-500"
        }
      >
        {mode === "dark" ? "Dark mode" : "Light mode"}
      </p>
    </div>
  );
}

export type CompanyProfileFormProps = {
  canEdit: boolean;
  profile: CompanyProfile;
};

export default function CompanyProfileForm({
  canEdit,
  profile,
}: CompanyProfileFormProps) {
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [brandColorValues, setBrandColorValues] = useState<BrandColorValues>(
    () => createBrandColorValues(profile),
  );
  const [selectedLogoPreviews, setSelectedLogoPreviews] =
    useState<SelectedLogoPreviews>(() => createEmptyLogoPreviews());
  const selectedLogoPreviewsRef = useRef<SelectedLogoPreviews>(
    createEmptyLogoPreviews(),
  );
  const [state, formAction, isPending] = useActionState(
    updateCompanyProfileAction,
    initialState,
  );
  const { showToast } = useToast();

  const clearSelectedLogoPreviews = useCallback(() => {
    revokeLogoPreviews(selectedLogoPreviewsRef.current);
    const emptyPreviews = createEmptyLogoPreviews();

    selectedLogoPreviewsRef.current = emptyPreviews;
    setSelectedLogoPreviews(emptyPreviews);
  }, []);

  useEffect(() => {
    return () => {
      revokeLogoPreviews(selectedLogoPreviewsRef.current);
    };
  }, []);

  useEffect(() => {
    if (!state.message) return;

    if (state.ok && state.profile) {
      const savedProfile = state.profile;

      queueMicrotask(() => {
        setCurrentProfile(savedProfile);
        setBrandColorValues(createBrandColorValues(savedProfile));
        clearSelectedLogoPreviews();
      });
    }

    showToast(state.message, state.ok ? "success" : "error");
  }, [
    clearSelectedLogoPreviews,
    showToast,
    state.message,
    state.ok,
    state.profile,
    state.savedAt,
  ]);

  const handleLogoFileChange = useCallback(
    (key: LogoPreviewKey) => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0] ?? null;
      const previousPreview = selectedLogoPreviewsRef.current[key];

      if (previousPreview) {
        URL.revokeObjectURL(previousPreview.url);
      }

      const nextPreview = file
        ? { name: file.name, url: URL.createObjectURL(file) }
        : null;
      const nextPreviews = {
        ...selectedLogoPreviewsRef.current,
        [key]: nextPreview,
      };

      selectedLogoPreviewsRef.current = nextPreviews;
      setSelectedLogoPreviews(nextPreviews);
    },
    [],
  );

  const handleBrandColorChange = useCallback(
    (key: BrandColorKey, value: string) => {
      setBrandColorValues((currentValues) => ({
        ...currentValues,
        [key]: value,
      }));
    },
    [],
  );

  const previewProfile = useMemo<CompanyProfile>(
    () => ({
      ...currentProfile,
      brandAccentColor: normalizeCompanyBrandColor(
        brandColorValues.brandAccentColor,
      ),
      brandPrimaryColor: normalizeCompanyBrandColor(
        brandColorValues.brandPrimaryColor,
      ),
      darkBrandPrimaryColor: normalizeCompanyBrandColor(
        brandColorValues.darkBrandPrimaryColor,
      ),
      lightBrandPrimaryColor: normalizeCompanyBrandColor(
        brandColorValues.lightBrandPrimaryColor,
      ),
      logoOriginalName:
        selectedLogoPreviews.defaultLogo?.name ??
        currentProfile.logoOriginalName,
      logoUrl: selectedLogoPreviews.defaultLogo?.url ?? currentProfile.logoUrl,
      lightLogoOriginalName:
        selectedLogoPreviews.lightLogo?.name ??
        currentProfile.lightLogoOriginalName,
      lightLogoUrl:
        selectedLogoPreviews.lightLogo?.url ?? currentProfile.lightLogoUrl,
      darkLogoOriginalName:
        selectedLogoPreviews.darkLogo?.name ??
        currentProfile.darkLogoOriginalName,
      darkLogoUrl:
        selectedLogoPreviews.darkLogo?.url ?? currentProfile.darkLogoUrl,
    }),
    [brandColorValues, currentProfile, selectedLogoPreviews],
  );

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Company profile
          </h2>
          <LazyHelpTooltip content="Controls company identity, registered address and the branding shown in the CRM header, sidebar and sign-in page." />
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Store client identity details and set CRM brand colours, logos and theme defaults.
        </p>
      </div>

      <div className="p-5">
        <div className="space-y-5">
          <div>
            <label
              htmlFor="organizationName"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Organisation name
            </label>
            <input
              id="organizationName"
              name="organizationName"
              type="text"
              defaultValue={currentProfile.organizationName}
              disabled={!canEdit || isPending}
              className={textInputClassName}
            />
          </div>

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Identity details
              </h3>
              <LazyHelpTooltip content="Stores the company details that can later feed client reports, document headers, proposals and email signatures." />
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              These values identify the client workspace and can be reused by client-facing outputs.
            </p>

            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              <CompanyTextField
                id="tradingName"
                name="tradingName"
                label="Trading name"
                value={currentProfile.tradingName}
                disabled={!canEdit || isPending}
                autoComplete="organization"
              />
              <CompanyTextField
                id="legalName"
                name="legalName"
                label="Legal company name"
                value={currentProfile.legalName}
                disabled={!canEdit || isPending}
                autoComplete="organization"
              />
              <CompanyTextField
                id="websiteUrl"
                name="websiteUrl"
                label="Website URL"
                type="url"
                placeholder="https://example.com"
                value={currentProfile.websiteUrl}
                disabled={!canEdit || isPending}
                autoComplete="url"
              />
              <CompanyTextField
                id="mainEmail"
                name="mainEmail"
                label="Main email"
                type="email"
                value={currentProfile.mainEmail}
                disabled={!canEdit || isPending}
                autoComplete="email"
              />
              <CompanyTextField
                id="mainPhone"
                name="mainPhone"
                label="Main phone"
                type="tel"
                value={currentProfile.mainPhone}
                disabled={!canEdit || isPending}
                autoComplete="tel"
              />
              <CompanyTextField
                id="companyRegistrationNumber"
                name="companyRegistrationNumber"
                label="Company number"
                value={currentProfile.companyRegistrationNumber}
                disabled={!canEdit || isPending}
              />
              <CompanyTextField
                id="vatNumber"
                name="vatNumber"
                label="VAT number"
                value={currentProfile.vatNumber}
                disabled={!canEdit || isPending}
              />
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Registered address
              </h3>
              <LazyHelpTooltip content="Stores the registered company address for future reports, proposals, documents and compliance metadata." />
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Keep the legal address separate from contact and customer addresses.
            </p>

            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              <CompanyTextField
                id="registeredAddressLine1"
                name="registeredAddressLine1"
                label="Address line 1"
                value={currentProfile.registeredAddressLine1}
                disabled={!canEdit || isPending}
                autoComplete="address-line1"
              />
              <CompanyTextField
                id="registeredAddressLine2"
                name="registeredAddressLine2"
                label="Address line 2"
                value={currentProfile.registeredAddressLine2}
                disabled={!canEdit || isPending}
                autoComplete="address-line2"
              />
              <CompanyTextField
                id="registeredCity"
                name="registeredCity"
                label="Town or city"
                value={currentProfile.registeredCity}
                disabled={!canEdit || isPending}
                autoComplete="address-level2"
              />
              <CompanyTextField
                id="registeredCounty"
                name="registeredCounty"
                label="County or region"
                value={currentProfile.registeredCounty}
                disabled={!canEdit || isPending}
                autoComplete="address-level1"
              />
              <CompanyTextField
                id="registeredPostcode"
                name="registeredPostcode"
                label="Postcode"
                value={currentProfile.registeredPostcode}
                disabled={!canEdit || isPending}
                autoComplete="postal-code"
              />
              <CompanyTextField
                id="registeredCountry"
                name="registeredCountry"
                label="Country"
                value={currentProfile.registeredCountry}
                disabled={!canEdit || isPending}
                autoComplete="country-name"
              />
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Document and report defaults
              </h3>
              <LazyHelpTooltip content="Stores reusable copy for client-facing reports, proposals and exported document packs." />
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Set the default title, intro, footer and policy links that future exports can reuse.
            </p>

            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              <CompanyTextField
                id="reportTitle"
                name="reportTitle"
                label="Default report title"
                placeholder="Monthly performance report"
                value={currentProfile.reportTitle}
                disabled={!canEdit || isPending}
              />
              <CompanyTextField
                id="preparedByName"
                name="preparedByName"
                label="Prepared by"
                placeholder="iD30"
                value={currentProfile.preparedByName}
                disabled={!canEdit || isPending}
                autoComplete="organization"
              />
              <CompanyTextareaField
                id="reportIntroText"
                name="reportIntroText"
                label="Report intro text"
                placeholder="A short introduction shown at the start of client-facing reports."
                value={currentProfile.reportIntroText}
                disabled={!canEdit || isPending}
              />
              <CompanyTextareaField
                id="documentFooterText"
                name="documentFooterText"
                label="Document footer text"
                placeholder="Optional footer copy for proposals, reports and client packs."
                value={currentProfile.documentFooterText}
                disabled={!canEdit || isPending}
              />
              <CompanyTextField
                id="termsUrl"
                name="termsUrl"
                label="Terms URL"
                placeholder="/terms"
                value={currentProfile.termsUrl}
                disabled={!canEdit || isPending}
              />
              <CompanyTextField
                id="privacyUrl"
                name="privacyUrl"
                label="Privacy policy URL"
                placeholder="/privacy-policy"
                value={currentProfile.privacyUrl}
                disabled={!canEdit || isPending}
              />
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Brand styling
              </h3>
              <LazyHelpTooltip content="Applies custom brand colours to CRM buttons, badges, focus states and the sign-in brand panel." />
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Leave a field blank to use the default iD30 colour. Use exact hex values from the client brand guidelines.
            </p>

            <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-5 md:grid-cols-2">
                <BrandColorField
                  id="brandPrimaryColor"
                  name="brandPrimaryColor"
                  label="Primary colour"
                  description="Default action colour and fallback for light and dark mode."
                  fallback={brandColorFallbacks.brandPrimaryColor}
                  value={brandColorValues.brandPrimaryColor}
                  disabled={!canEdit || isPending}
                  onChange={handleBrandColorChange}
                />
                <BrandColorField
                  id="brandAccentColor"
                  name="brandAccentColor"
                  label="Accent colour"
                  description="Secondary highlight colour for brand-led surfaces."
                  fallback={brandColorFallbacks.brandAccentColor}
                  value={brandColorValues.brandAccentColor}
                  disabled={!canEdit || isPending}
                  onChange={handleBrandColorChange}
                />
                <BrandColorField
                  id="lightBrandPrimaryColor"
                  name="lightBrandPrimaryColor"
                  label="Light mode primary"
                  description="Overrides the primary colour on light CRM surfaces."
                  fallback={brandColorFallbacks.lightBrandPrimaryColor}
                  value={brandColorValues.lightBrandPrimaryColor}
                  disabled={!canEdit || isPending}
                  onChange={handleBrandColorChange}
                />
                <BrandColorField
                  id="darkBrandPrimaryColor"
                  name="darkBrandPrimaryColor"
                  label="Dark mode primary"
                  description="Overrides the primary colour on dark CRM surfaces."
                  fallback={brandColorFallbacks.darkBrandPrimaryColor}
                  value={brandColorValues.darkBrandPrimaryColor}
                  disabled={!canEdit || isPending}
                  onChange={handleBrandColorChange}
                />
              </div>

              <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Brand preview
                </p>
                <div className="mt-3">
                  <BrandThemePreview profile={previewProfile} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Logo assets
              </h3>
              <LazyHelpTooltip content="Uploads the default, light mode and dark mode logos used by the CRM shell and sign-in page." />
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Upload each logo variant and preview selected files before saving.
            </p>

            <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="grid gap-5 md:grid-cols-3">
                  <LogoUploadField
                    id="companyLogo"
                    name="companyLogo"
                    label="Default logo"
                    description="Fallback used when a mode-specific logo is not set."
                    disabled={!canEdit || isPending}
                    onChange={handleLogoFileChange("defaultLogo")}
                  />
                  <LogoUploadField
                    id="lightModeLogo"
                    name="lightModeLogo"
                    label="Light mode logo"
                    description="Used on light CRM surfaces."
                    disabled={!canEdit || isPending}
                    onChange={handleLogoFileChange("lightLogo")}
                  />
                  <LogoUploadField
                    id="darkModeLogo"
                    name="darkModeLogo"
                    label="Dark mode logo"
                    description="Used on dark CRM surfaces and sign-in."
                    disabled={!canEdit || isPending}
                    onChange={handleLogoFileChange("darkLogo")}
                  />
                </div>

                <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Use SVG, PNG, JPG or WebP. Keep each file under 2MB for fast route changes.
                </p>

                <div className="grid gap-3 md:grid-cols-3">
                  <RemoveLogoCheckbox
                    name="removeLogo"
                    label="Remove default logo"
                    show={Boolean(currentProfile.logoUrl)}
                    disabled={!canEdit || isPending}
                  />
                  <RemoveLogoCheckbox
                    name="removeLightLogo"
                    label="Remove light mode logo"
                    show={Boolean(currentProfile.lightLogoUrl)}
                    disabled={!canEdit || isPending}
                  />
                  <RemoveLogoCheckbox
                    name="removeDarkLogo"
                    label="Remove dark mode logo"
                    show={Boolean(currentProfile.darkLogoUrl)}
                    disabled={!canEdit || isPending}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Logo previews
                </p>
                <div className="mt-3 grid gap-3">
                  <LogoPreview mode="light" profile={previewProfile} />
                  <LogoPreview mode="dark" profile={previewProfile} />
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">
                      Light source
                    </dt>
                    <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                      {logoSourceLabel(
                        currentProfile,
                        "light",
                        selectedLogoPreviews,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">
                      Dark source
                    </dt>
                    <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                      {logoSourceLabel(
                        currentProfile,
                        "dark",
                        selectedLogoPreviews,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">
                      Used in
                    </dt>
                    <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                      Header, sidebar, controls and sign-in
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <ActionStateMessage state={state.message ? state : undefined} />
        </div>
      </div>

      <div className="flex justify-end border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <button
          type="submit"
          disabled={!canEdit || isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save company profile"}
        </button>
      </div>
    </form>
  );
}
