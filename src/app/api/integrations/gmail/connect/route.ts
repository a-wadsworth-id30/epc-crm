import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gmailProvider } from "@/lib/integrations/gmail";
import { id30AuthBrokerStartUrl } from "@/lib/integrations/id30-auth-oauth";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }
  if (user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const url = await id30AuthBrokerStartUrl({
    provider: gmailProvider,
    request,
    returnPath: "/settings/integrations/gmail",
    userId: user.id,
  });

  if (!url) {
    return NextResponse.redirect(
      new URL("/settings/integrations/gmail?oauth=missing-auth", request.url),
    );
  }

  return NextResponse.redirect(url);
}
