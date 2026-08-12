import type { Metadata } from "next";
import MarketingPage from "../page";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Executive Report | iD30 CRM",
  description: "Client-facing commercial attribution summary.",
};

export default async function MarketingExecutiveReportPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  return <MarketingPage searchParams={Promise.resolve({ ...params, view: "executive-report" })} />;
}
