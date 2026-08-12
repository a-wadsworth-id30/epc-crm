import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createMarketingOAuthState,
  findMarketingOAuthProvider,
  marketingAuthBrokerStartUrl,
  marketingOAuthConfigured,
  marketingOAuthRedirect,
  marketingOAuthStateCookie,
  marketingOAuthStartUrl,
} from "@/lib/marketing/oauth";

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

  if (!(await marketingOAuthConfigured(provider))) {
    return marketingOAuthRedirect(request, provider, "missing-env");
  }

  const authBrokerUrl = await marketingAuthBrokerStartUrl({
    provider,
    request,
    userId: user.id,
  });

  if (authBrokerUrl) {
    return NextResponse.redirect(authBrokerUrl);
  }

  const state = createMarketingOAuthState();
  const authUrl = await marketingOAuthStartUrl(request, provider, state);

  if (!authUrl) {
    return marketingOAuthRedirect(request, provider, "missing-env");
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(marketingOAuthStateCookie(provider), state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
