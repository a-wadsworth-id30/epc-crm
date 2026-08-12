import { expect, test, type Page } from "@playwright/test";

const email =
  process.env.E2E_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const password =
  process.env.E2E_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

const appRoutes = [
  { label: "Dashboard", path: "/" },
  { label: "Sales", path: "/sales" },
  { label: "Marketing", path: "/marketing" },
  {
    label: "Marketing attribution reports",
    path: "/marketing/attribution-reports",
  },
  { label: "Marketing lead sources", path: "/marketing/lead-sources" },
  {
    label: "Marketing offline campaigns",
    path: "/marketing/offline-campaigns",
  },
  { label: "Marketing offline media", path: "/marketing/offline-media" },
  { label: "Marketing sales quality", path: "/marketing/sales-quality" },
  { label: "Marketing executive report", path: "/marketing/executive-report" },
  { label: "Marketing visitors", path: "/marketing/visitors" },
  { label: "Inbox", path: "/inbox" },
  { label: "Contacts", path: "/contacts" },
  { label: "Telephony", path: "/telephony" },
  { label: "Telephony live", path: "/telephony/live" },
  { label: "Telephony users", path: "/telephony/users" },
  { label: "Telephony numbers", path: "/telephony/numbers" },
  { label: "Telephony recordings", path: "/telephony/recordings" },
  {
    label: "Call tracking overview",
    path: "/telephony/call-tracking/overview",
  },
  { label: "Attribution settings", path: "/settings/attribution" },
  {
    label: "Tracking script settings",
    path: "/settings/attribution/tracking-script",
  },
  {
    label: "Form tracking settings",
    path: "/settings/attribution/form-tracking",
  },
  { label: "Consent settings", path: "/settings/attribution/consent-settings" },
  { label: "Settings integrations", path: "/settings/integrations" },
] as const;

type AuthState = "authenticated" | "database-unavailable";

type OverflowResult = {
  documentWidth: number;
  viewportWidth: number;
  overflow: number;
  offenders: Array<{
    selector: string;
    text: string;
    left: number;
    right: number;
    width: number;
  }>;
};

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
    "Responsive QA could not sign in. Set E2E_EMAIL/E2E_PASSWORD or run the seed admin account.",
  );
}

function isSignInPath(page: Page) {
  return new URL(page.url()).pathname.startsWith("/signin");
}

async function waitForPageSettle(page: Page) {
  await page
    .waitForLoadState("domcontentloaded", { timeout: 5_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

async function measurePageOverflow(page: Page): Promise<OverflowResult> {
  const evaluateOverflow = () => page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const documentWidth = Math.ceil(
      Math.max(
        document.documentElement.scrollWidth,
        document.body?.scrollWidth ?? 0,
      ),
    );
    const overflow = documentWidth - viewportWidth;

    const offenders = Array.from(
      document.querySelectorAll<HTMLElement>("body *"),
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element,
          rect,
        };
      })
      .filter(({ element, rect }) => {
        const style = window.getComputedStyle(element);

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          (rect.left < -2 || rect.right > viewportWidth + 2)
        );
      })
      .slice(0, 8)
      .map(({ element, rect }) => {
        const id = element.id ? `#${element.id}` : "";
        const className =
          typeof element.className === "string"
            ? element.className
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 4)
                .map((value) => `.${value}`)
                .join("")
            : "";

        return {
          selector: `${element.tagName.toLowerCase()}${id}${className}`,
          text: (element.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      });

    return {
      documentWidth,
      viewportWidth,
      overflow,
      offenders,
    };
  });

  try {
    return await evaluateOverflow();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (!message.includes("Execution context was destroyed")) {
      throw error;
    }

    await waitForPageSettle(page);
    return evaluateOverflow();
  }
}

function overflowMessage(
  route: (typeof appRoutes)[number],
  viewport: (typeof viewports)[number],
  result: OverflowResult,
) {
  const offenders = result.offenders.length
    ? `\nPotential offenders:\n${result.offenders
        .map(
          (offender) =>
            `- ${offender.selector} left=${offender.left} right=${offender.right} width=${offender.width} text="${offender.text}"`,
        )
        .join("\n")}`
    : "";

  return `${route.label} (${route.path}) overflowed by ${result.overflow}px at ${viewport.name} (${viewport.width}x${viewport.height}). Document width: ${result.documentWidth}px; viewport width: ${result.viewportWidth}px.${offenders}`;
}

test("authenticated CRM pages avoid page-level horizontal overflow", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const authState = await authenticate(page);

  test.skip(
    authState === "database-unavailable",
    "Skipping responsive QA because the local CRM database is unavailable.",
  );

  for (const viewport of viewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    for (const route of appRoutes) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await waitForPageSettle(page);

      expect(
        isSignInPath(page),
        `${route.label} redirected to sign in after authentication.`,
      ).toBe(false);

      const result = await measurePageOverflow(page);

      expect(
        result.overflow,
        overflowMessage(route, viewport, result),
      ).toBeLessThanOrEqual(2);
    }
  }
});
