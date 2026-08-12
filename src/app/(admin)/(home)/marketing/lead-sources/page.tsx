import type { Metadata } from "next";
import MarketingPage from "../page";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Lead Sources | iD30 CRM",
  description: "Source-level lead, call and pipeline reporting.",
};

export default async function MarketingLeadSourcesPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  return <MarketingPage searchParams={Promise.resolve({ ...params, view: "lead-sources" })} />;
}
