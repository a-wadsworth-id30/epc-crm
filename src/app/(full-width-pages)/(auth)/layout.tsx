import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import AppLogo from "@/components/crm-boilerplate/AppLogo";
import { ThemeProvider } from "@/context/ThemeContext";
import {
  defaultCompanyProfile,
  getCompanyBrandStyle,
  normalizeCompanyBrandColor,
  type CompanyProfile,
} from "@/lib/company-profile";
import Link from "next/link";
import type { CSSProperties } from "react";

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return null;
}

function staticAuthCompanyProfile(): CompanyProfile {
  return {
    ...defaultCompanyProfile,
    organizationName:
      envValue("AUTH_ORGANIZATION_NAME", "NEXT_PUBLIC_APP_NAME") ??
      defaultCompanyProfile.organizationName,
    logoUrl: envValue("AUTH_LOGO_URL", "NEXT_PUBLIC_AUTH_LOGO_URL"),
    lightLogoUrl: envValue(
      "AUTH_LIGHT_LOGO_URL",
      "NEXT_PUBLIC_AUTH_LIGHT_LOGO_URL",
    ),
    darkLogoUrl: envValue(
      "AUTH_DARK_LOGO_URL",
      "NEXT_PUBLIC_AUTH_DARK_LOGO_URL",
    ),
    brandPrimaryColor: normalizeCompanyBrandColor(
      envValue("AUTH_BRAND_PRIMARY_COLOR", "NEXT_PUBLIC_AUTH_BRAND_PRIMARY_COLOR"),
    ),
    lightBrandPrimaryColor: normalizeCompanyBrandColor(
      envValue(
        "AUTH_LIGHT_BRAND_PRIMARY_COLOR",
        "NEXT_PUBLIC_AUTH_LIGHT_BRAND_PRIMARY_COLOR",
      ),
    ),
    darkBrandPrimaryColor: normalizeCompanyBrandColor(
      envValue(
        "AUTH_DARK_BRAND_PRIMARY_COLOR",
        "NEXT_PUBLIC_AUTH_DARK_BRAND_PRIMARY_COLOR",
      ),
    ),
    brandAccentColor: normalizeCompanyBrandColor(
      envValue("AUTH_BRAND_ACCENT_COLOR", "NEXT_PUBLIC_AUTH_BRAND_ACCENT_COLOR"),
    ),
  };
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const companyProfile = staticAuthCompanyProfile();
  const companyBrandStyle = getCompanyBrandStyle(companyProfile) as
    | CSSProperties
    | undefined;

  return (
    <div
      className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0"
      data-company-brand={companyBrandStyle ? "" : undefined}
      style={companyBrandStyle}
    >
      <ThemeProvider>
        <div className="relative flex lg:flex-row w-full h-screen justify-center flex-col  dark:bg-gray-900 sm:p-0">
          {children}
          <div className="lg:w-1/2 w-full h-full bg-brand-950 lg:grid items-center hidden">
            <div className="relative items-center justify-center  flex z-1">
              {/* <!-- ===== Common Grid Shape Start ===== --> */}
              <GridShape />
              <div className="flex flex-col items-center max-w-xs">
                <Link href="/" className="block mb-4">
                  <AppLogo
                    width={180}
                    height={81}
                    className="h-16 max-w-[240px]"
                    companyProfile={companyProfile}
                    variant="auth"
                    priority
                  />
                </Link>
                <p className="text-center text-gray-400 dark:text-white/60">
                  Customer, sales, marketing and telephony operations in one workspace.
                </p>
              </div>
            </div>
          </div>
          <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
            <ThemeTogglerTwo />
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}
