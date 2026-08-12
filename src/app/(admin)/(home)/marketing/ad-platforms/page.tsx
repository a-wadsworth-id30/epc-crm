import type { Metadata } from "next";
import MarketingPage from "../page";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Ad Platforms | iD30 CRM",
  description: "Imported ad spend, campaign rows and provider sync health.",
};

export default async function MarketingAdPlatformsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  return <MarketingPage searchParams={Promise.resolve({ ...params, view: "ad-platforms" })} />;
}
