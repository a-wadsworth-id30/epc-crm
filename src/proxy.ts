import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "id30_crm_session";
const publicRoutes = [
  "/signin",
  "/reset-password",
  "/error-404",
  "/error-500",
  "/error-503",
  "/downloads",
  "/share",
  "/upload",
  "/privacy",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/offline",
  "/portal",
  "/icons",
  "/attribution.js",
  "/attribution-toggle-test.html",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route),
  );
  const hasSessionCookie = Boolean(request.cookies.get(sessionCookieName));

  if (!isPublicRoute && !hasSessionCookie) {
    const url = request.nextUrl.clone();
    const nextPath = `${pathname}${request.nextUrl.search}`;
    url.pathname = "/signin";
    url.search = "";
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|icons|api|manifest\\.webmanifest|service-worker\\.js|offline|attribution\\.js|attribution-toggle-test\\.html).*)",
  ],
};
