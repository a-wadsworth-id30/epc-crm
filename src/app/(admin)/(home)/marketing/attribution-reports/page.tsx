import type { Metadata } from "next";
import MarketingPage from "../page";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Attribution Reports | iD30 CRM",
  description: "Source, campaign and lifecycle attribution reports.",
};

export default async function MarketingAttributionReportsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  return <MarketingPage searchParams={Promise.resolve({ ...params, view: "attribution-reports" })} />;
}
