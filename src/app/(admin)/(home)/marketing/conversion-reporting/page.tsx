import type { Metadata } from "next";
import MarketingPage from "../page";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Conversion Reporting | iD30 CRM",
  description: "Captured conversions and provider upload readiness.",
};

export default async function MarketingConversionReportingPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  return <MarketingPage searchParams={Promise.resolve({ ...params, view: "conversion-reporting" })} />;
}
