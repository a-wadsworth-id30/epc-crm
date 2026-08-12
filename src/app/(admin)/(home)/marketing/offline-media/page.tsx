import type { Metadata } from "next";
import MarketingPage from "../page";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Offline Media Report | iD30 CRM",
  description: "Offline campaign metadata, calls, leads and pipeline contribution.",
};

export default async function MarketingOfflineMediaPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  return <MarketingPage searchParams={Promise.resolve({ ...params, view: "offline-media" })} />;
}
