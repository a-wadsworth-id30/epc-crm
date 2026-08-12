import "server-only";

import {
  getCompanyLogoUrl,
  parseCompanyProfile,
} from "@/lib/company-profile";
import { getCrmSettings } from "@/lib/settings";

export type CustomerUploadBranding = {
  logoUrl: string;
  name: string;
};

const defaultUploadLogoUrl = "/images/logo/logo.svg";

export async function getCustomerUploadBranding(): Promise<CustomerUploadBranding> {
  const settings = await getCrmSettings();
  const profile = parseCompanyProfile(settings.companyProfile);

  return {
    logoUrl: getCompanyLogoUrl(profile, "light") ?? defaultUploadLogoUrl,
    name: profile.organizationName,
  };
}

export function absoluteCustomerUploadLogoUrl({
  logoUrl,
  uploadUrl,
}: {
  logoUrl: string;
  uploadUrl: string;
}) {
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;

  return new URL(logoUrl, uploadUrl).toString();
}
