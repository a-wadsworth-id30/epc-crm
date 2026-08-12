import { redirect } from "next/navigation";

type PageParams = {
  provider: string;
};

type PageSearchParams = {
  oauth?: string | string[];
};

export default async function MarketingIntegrationProviderRedirect({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<PageSearchParams>;
}) {
  const { provider } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const oauthStatus = Array.isArray(resolvedSearchParams.oauth)
    ? resolvedSearchParams.oauth[0]
    : resolvedSearchParams.oauth;
  const suffix = oauthStatus
    ? `?oauth=${encodeURIComponent(oauthStatus)}`
    : "";

  redirect(`/settings/integrations/${provider}${suffix}`);
}
