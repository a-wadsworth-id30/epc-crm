import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  refreshBingAdsSelectorOptionsAction,
  refreshGoogleAdsSelectorOptionsAction,
  refreshGoogleAnalyticsSelectorOptionsAction,
  refreshGoogleSearchConsoleSelectorOptionsAction,
  refreshLinkedInAdsSelectorOptionsAction,
  refreshMetaSelectorOptionsAction,
} from "@/lib/actions/marketing-integrations";
import {
  findMarketingOAuthProvider,
  marketingOAuthRedirect,
  marketingOAuthStateCookie,
  saveMarketingOAuthCredentials,
} from "@/lib/marketing/oauth";

const selectorRefreshInitialState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await getCurrentUser();
  const { provider: providerSlug } = await params;
  const provider = findMarketingOAuthProvider(providerSlug);

  if (!user) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  if (user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!provider) {
    return NextResponse.redirect(new URL("/settings/integrations", request.url));
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(marketingOAuthStateCookie(provider))?.value;

  if (error) {
    const response = marketingOAuthRedirect(request, provider, "denied");
    response.cookies.delete(marketingOAuthStateCookie(provider));
    return response;
  }

  if (!code || !state || state !== expectedState) {
    const response = marketingOAuthRedirect(request, provider, "invalid-state");
    response.cookies.delete(marketingOAuthStateCookie(provider));
    return response;
  }

  try {
    await saveMarketingOAuthCredentials({ code, provider, request });
  } catch (oauthError) {
    console.error(`${provider.name} OAuth callback failed`, oauthError);
    const response = marketingOAuthRedirect(request, provider, "error");
    response.cookies.delete(marketingOAuthStateCookie(provider));
    return response;
  }

  let oauthStatus = "connected";

  try {
    const selectorRefreshState = await refreshSelectorsAfterOAuth(provider.slug);
    if (selectorRefreshState) {
      oauthStatus = selectorRefreshState.ok
        ? "connected-selectors-refreshed"
        : "connected-selectors-needed";

      if (!selectorRefreshState.ok) {
        console.warn(
          `${provider.name} OAuth connected but selector refresh did not complete: ${selectorRefreshState.message}`,
        );
      }
    }
  } catch (refreshError) {
    oauthStatus = "connected-selectors-needed";
    console.warn(`${provider.name} selector refresh failed after OAuth`, refreshError);
  }

  const response = marketingOAuthRedirect(request, provider, oauthStatus);
  response.cookies.delete(marketingOAuthStateCookie(provider));
  return response;
}

function refreshSelectorsAfterOAuth(providerSlug: string) {
  if (providerSlug === "google-ads") {
    return refreshGoogleAdsSelectorOptionsAction(selectorRefreshInitialState);
  }

  if (providerSlug === "google-analytics") {
    return refreshGoogleAnalyticsSelectorOptionsAction(
      selectorRefreshInitialState,
    );
  }

  if (providerSlug === "google-search-console") {
    return refreshGoogleSearchConsoleSelectorOptionsAction(
      selectorRefreshInitialState,
    );
  }

  if (providerSlug === "bing-ads") {
    return refreshBingAdsSelectorOptionsAction(selectorRefreshInitialState);
  }

  if (providerSlug === "meta") {
    return refreshMetaSelectorOptionsAction(selectorRefreshInitialState);
  }

  if (providerSlug === "linkedin-ads") {
    return refreshLinkedInAdsSelectorOptionsAction(selectorRefreshInitialState);
  }

  return null;
}
