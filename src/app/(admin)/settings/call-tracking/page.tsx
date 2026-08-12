import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const sectionPath: Record<string, string> = {
  overview: "/telephony/call-tracking/overview",
  "number-pools": "/telephony/call-tracking/pools",
  "dni-rules": "/telephony/call-tracking/dni-rules",
  "tracking-numbers": "/telephony/call-tracking/numbers",
  diagnostics: "/telephony/call-tracking/diagnostics",
  validation: "/telephony/call-tracking/validation",
};

export default async function LegacyCallTrackingSettingsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const requestedSection = Array.isArray(params.section)
    ? params.section[0]
    : params.section;

  redirect(
    requestedSection && sectionPath[requestedSection]
      ? sectionPath[requestedSection]
      : "/telephony/call-tracking/overview",
  );
}
