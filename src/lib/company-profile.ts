import { z } from "zod";

const defaultOrganizationName =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "iD30 CRM";

const nullableStringSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

const logoUrlSchema = nullableStringSchema.refine(
  (value) => !value || value.startsWith("/") || /^https?:\/\//i.test(value),
  "Logo URL must be a local path or full URL.",
);
const nullableTextSchema = (max: number, label: string) =>
  nullableStringSchema.refine(
    (value) => !value || value.length <= max,
    `${label} must be ${max} characters or fewer.`,
  );
const nullableEmailSchema = nullableStringSchema
  .refine(
    (value) => !value || z.string().email().safeParse(value).success,
    "Enter a valid main email address.",
  )
  .transform((value) => value?.toLowerCase() ?? null);
const nullableWebsiteUrlSchema = nullableStringSchema.refine(
  (value) => !value || /^https?:\/\//i.test(value),
  "Website URL must start with http:// or https://.",
);
const nullablePublicUrlSchema = nullableStringSchema.refine(
  (value) => !value || value.startsWith("/") || /^https?:\/\//i.test(value),
  "URL must be a site-relative path or full URL.",
);
const hexColorPattern = /^#[0-9a-f]{6}$/i;
const brandColorSchema = nullableStringSchema
  .refine(
    (value) => !value || hexColorPattern.test(value),
    "Use a 6-digit hex colour, for example #465fff.",
  )
  .transform((value) => value?.toLowerCase() ?? null);

export const companyProfileSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .max(120, "Organisation name must be 120 characters or fewer.")
    .optional()
    .transform((value) => value || defaultOrganizationName),
  tradingName: nullableTextSchema(120, "Trading name"),
  legalName: nullableTextSchema(160, "Legal company name"),
  websiteUrl: nullableWebsiteUrlSchema,
  mainEmail: nullableEmailSchema,
  mainPhone: nullableTextSchema(60, "Main phone number"),
  companyRegistrationNumber: nullableTextSchema(
    80,
    "Company registration number",
  ),
  vatNumber: nullableTextSchema(80, "VAT number"),
  registeredAddressLine1: nullableTextSchema(160, "Address line 1"),
  registeredAddressLine2: nullableTextSchema(160, "Address line 2"),
  registeredCity: nullableTextSchema(100, "Town or city"),
  registeredCounty: nullableTextSchema(100, "County or region"),
  registeredPostcode: nullableTextSchema(40, "Postcode"),
  registeredCountry: nullableTextSchema(80, "Country"),
  reportTitle: nullableTextSchema(140, "Report title"),
  reportIntroText: nullableTextSchema(600, "Report intro text"),
  documentFooterText: nullableTextSchema(600, "Document footer text"),
  preparedByName: nullableTextSchema(120, "Prepared by name"),
  termsUrl: nullablePublicUrlSchema,
  privacyUrl: nullablePublicUrlSchema,
  logoFileAssetId: nullableStringSchema,
  logoOriginalName: nullableStringSchema,
  logoUrl: logoUrlSchema,
  lightLogoFileAssetId: nullableStringSchema,
  lightLogoOriginalName: nullableStringSchema,
  lightLogoUrl: logoUrlSchema,
  darkLogoFileAssetId: nullableStringSchema,
  darkLogoOriginalName: nullableStringSchema,
  darkLogoUrl: logoUrlSchema,
  brandPrimaryColor: brandColorSchema,
  lightBrandPrimaryColor: brandColorSchema,
  darkBrandPrimaryColor: brandColorSchema,
  brandAccentColor: brandColorSchema,
  updatedAt: nullableStringSchema,
});

export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export const defaultCompanyProfile: CompanyProfile = {
  organizationName: defaultOrganizationName,
  tradingName: null,
  legalName: null,
  websiteUrl: null,
  mainEmail: null,
  mainPhone: null,
  companyRegistrationNumber: null,
  vatNumber: null,
  registeredAddressLine1: null,
  registeredAddressLine2: null,
  registeredCity: null,
  registeredCounty: null,
  registeredPostcode: null,
  registeredCountry: null,
  reportTitle: null,
  reportIntroText: null,
  documentFooterText: null,
  preparedByName: null,
  termsUrl: null,
  privacyUrl: null,
  logoFileAssetId: null,
  logoOriginalName: null,
  logoUrl: null,
  lightLogoFileAssetId: null,
  lightLogoOriginalName: null,
  lightLogoUrl: null,
  darkLogoFileAssetId: null,
  darkLogoOriginalName: null,
  darkLogoUrl: null,
  brandPrimaryColor: null,
  lightBrandPrimaryColor: null,
  darkBrandPrimaryColor: null,
  brandAccentColor: null,
  updatedAt: null,
};

export function parseCompanyProfile(value: unknown): CompanyProfile {
  const parsed = companyProfileSchema.safeParse(value ?? {});

  return parsed.success ? parsed.data : defaultCompanyProfile;
}

export function getCompanyLogoUrl(
  profile: CompanyProfile,
  mode: "dark" | "light",
) {
  if (mode === "light") {
    return profile.lightLogoUrl ?? profile.logoUrl ?? profile.darkLogoUrl;
  }

  return profile.darkLogoUrl ?? profile.logoUrl ?? profile.lightLogoUrl;
}

export function normalizeCompanyBrandColor(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) return null;

  return hexColorPattern.test(trimmedValue)
    ? trimmedValue.toLowerCase()
    : null;
}

export function getCompanyBrandStyle(profile: CompanyProfile) {
  const primaryColor = normalizeCompanyBrandColor(profile.brandPrimaryColor);
  const lightPrimaryColor = normalizeCompanyBrandColor(
    profile.lightBrandPrimaryColor,
  );
  const darkPrimaryColor = normalizeCompanyBrandColor(
    profile.darkBrandPrimaryColor,
  );
  const accentColor = normalizeCompanyBrandColor(profile.brandAccentColor);

  if (!primaryColor && !lightPrimaryColor && !darkPrimaryColor && !accentColor) {
    return undefined;
  }

  const style: Record<`--${string}`, string> = {};

  if (primaryColor) {
    style["--id30-company-brand-primary"] = primaryColor;
  }

  if (lightPrimaryColor) {
    style["--id30-company-brand-primary-light"] = lightPrimaryColor;
  }

  if (darkPrimaryColor) {
    style["--id30-company-brand-primary-dark"] = darkPrimaryColor;
  }

  if (accentColor) {
    style["--id30-company-brand-accent"] = accentColor;
  }

  return style;
}
