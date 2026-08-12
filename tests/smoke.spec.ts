import { expect, test, type Page } from "@playwright/test";

const email =
  process.env.E2E_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const password =
  process.env.E2E_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

const criticalAdminRoutes = [
  { label: "Dashboard", path: "/" },
  { label: "Marketing", path: "/marketing" },
  { label: "Sales", path: "/sales" },
  { label: "Settings system", path: "/settings/system" },
  { label: "Settings integrations", path: "/settings/integrations" },
  { label: "Telephony", path: "/telephony" },
] as const;

const unauthenticatedApiRoutes = [
  "/api/contacts",
  "/api/search/records?q=jo",
  "/api/quick-create/options",
  "/api/quick-create/contacts?q=jo",
  "/api/integrations/geoapify/address/autocomplete?q=york",
  "/api/notifications",
] as const;

test("signin page loads", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("protected JSON API routes return consistent unauthenticated responses", async ({
  request,
}) => {
  for (const path of unauthenticatedApiRoutes) {
    const response = await request.get(path);
    const contentType = response.headers()["content-type"] ?? "";
    const body = (await response.json()) as { ok?: boolean; message?: string };

    expect(response.status(), `${path} should reject unauthenticated access.`).toBe(
      401,
    );
    expect(contentType, `${path} should return JSON.`).toContain(
      "application/json",
    );
    expect(body.ok, `${path} should include an API failure flag.`).toBe(false);
    expect(body.message, `${path} should include a stable API message.`).toBe(
      "Authentication is required.",
    );
  }
});

test("critical authenticated routes render without route error boundaries", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const authState = await authenticate(page);

  test.skip(
    authState === "database-unavailable",
    "Skipping route smoke tests because the local CRM database is unavailable.",
  );

  for (const route of criticalAdminRoutes) {
    const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await waitForPageSettle(page);

    expect(
      response?.status() ?? 0,
      `${route.label} (${route.path}) returned a server error status.`,
    ).toBeLessThan(500);
    expect(
      isSignInPath(page),
      `${route.label} (${route.path}) redirected to sign in after authentication.`,
    ).toBe(false);

    const bodyText = await page.locator("body").innerText();

    expect(
      bodyText,
      `${route.label} (${route.path}) rendered an admin route error boundary.`,
    ).not.toMatch(/\b(?:page|workspace|settings|reports|sales|marketing|telephony).+could not load\b/i);
    expect(
      bodyText,
      `${route.label} (${route.path}) rendered an error digest.`,
    ).not.toMatch(/Error reference:/i);
  }
});

type AuthState = "authenticated" | "database-unavailable";

async function authenticate(page: Page): Promise<AuthState> {
  await page.goto("/signin", { waitUntil: "domcontentloaded" });

  if (!isSignInPath(page)) {
    return "authenticated";
  }

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page
      .waitForURL((url) => !url.pathname.startsWith("/signin"), {
        timeout: 20_000,
      })
      .catch(() => undefined),
    page.getByRole("button", { name: /^sign in$/i }).click(),
  ]);
  await waitForPageSettle(page);

  if (!isSignInPath(page)) {
    return "authenticated";
  }

  const databaseUnavailable = await page
    .getByText("The CRM database is unavailable", { exact: false })
    .isVisible()
    .catch(() => false);

  if (databaseUnavailable) {
    return "database-unavailable";
  }

  throw new Error(
    "Route smoke tests could not sign in. Set E2E_EMAIL/E2E_PASSWORD or run the seed admin account.",
  );
}

function isSignInPath(page: Page) {
  return new URL(page.url()).pathname.startsWith("/signin");
}

async function waitForPageSettle(page: Page) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(250);
}
