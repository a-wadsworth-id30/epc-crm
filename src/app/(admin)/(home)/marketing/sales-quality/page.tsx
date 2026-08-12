import type { Metadata } from "next";
import MarketingPage from "../page";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Sales Quality Report | iD30 CRM",
  description: "Lead quality, owner follow-up and pipeline hygiene by commercial source.",
};

export default async function MarketingSalesQualityPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  return <MarketingPage searchParams={Promise.resolve({ ...params, view: "sales-quality" })} />;
}
