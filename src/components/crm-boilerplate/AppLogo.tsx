"use client";

import Image from "next/image";
import {
  getCompanyLogoUrl,
  type CompanyProfile,
} from "@/lib/company-profile";

export default function AppLogo({
  className,
  companyProfile,
  height,
  priority,
  variant = "full",
  width,
}: {
  className: string;
  companyProfile: CompanyProfile;
  height: number;
  priority?: boolean;
  variant?: "auth" | "full" | "icon";
  width: number;
}) {
  const lightLogoUrl = getCompanyLogoUrl(companyProfile, "light");
  const darkLogoUrl = getCompanyLogoUrl(companyProfile, "dark");

  if (lightLogoUrl || darkLogoUrl) {
    if (lightLogoUrl === darkLogoUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lightLogoUrl ?? darkLogoUrl ?? ""}
          alt={`${companyProfile.organizationName} logo`}
          className={`${className} object-contain`}
        />
      );
    }

    return (
      <>
        {lightLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lightLogoUrl}
            alt={`${companyProfile.organizationName} logo`}
            className={`${className} object-contain dark:hidden`}
          />
        ) : null}
        {darkLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={darkLogoUrl}
            alt={`${companyProfile.organizationName} logo`}
            className={`hidden ${className} object-contain dark:block`}
          />
        ) : null}
      </>
    );
  }

  if (variant === "icon") {
    return (
      <Image
        className={className}
        src="/images/logo/logo-icon.svg"
        alt="Logo"
        width={width}
        height={height}
        priority={priority}
        style={{ width: "auto" }}
      />
    );
  }

  if (variant === "auth") {
    return (
      <Image
        className={`${className} invert`}
        src="/images/logo/auth-logo.svg"
        alt="Logo"
        width={width}
        height={height}
        priority={priority}
        style={{ width: "auto" }}
      />
    );
  }

  return (
    <>
      <Image
        className={`${className} dark:hidden`}
        src="/images/logo/logo.svg"
        alt="Logo"
        width={width}
        height={height}
        priority={priority}
        style={{ width: "auto" }}
      />
      <Image
        className={`hidden ${className} dark:block dark:invert`}
        src="/images/logo/logo-dark.svg"
        alt="Logo"
        width={width}
        height={height}
        priority={priority}
        style={{ width: "auto" }}
      />
    </>
  );
}
