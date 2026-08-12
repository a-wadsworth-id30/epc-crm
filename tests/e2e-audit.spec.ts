import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

const email =
  process.env.E2E_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const password =
  process.env.E2E_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

const viewports = [
  { height: 900, name: "mobile", width: 390 },
  { height: 1000, name: "desktop", width: 1440 },
] as const;

const auditedRoutes = [
  { label: "Dashboard", path: "/" },
  { label: "Sales table", path: "/sales" },
  { label: "Sales Kanban", path: "/sales?view=kanban" },
  { label: "Contacts", path: "/contacts" },
  { label: "Organisations", path: "/clients" },
  { label: "Storage", path: "/storage" },
  { label: "Tasks", path: "/tasks" },
  { label: "Inbox", path: "/inbox" },
  { label: "Reports", path: "/reports" },
  { label: "Products", path: "/products" },
  { label: "Discovery", path: "/discovery" },
  { label: "Marketing", path: "/marketing" },
  { label: "Marketing visitors", path: "/marketing/visitors" },
  { label: "Marketing lead sources", path: "/marketing/lead-sources" },
  { label: "Marketing sales quality", path: "/marketing/sales-quality" },
  { label: "Telephony", path: "/telephony" },
  { label: "Telephony live", path: "/telephony/live" },
  { label: "General settings", path: "/settings/general" },
  { label: "Company settings", path: "/settings/company" },
  { label: "Setup settings", path: "/settings/setup" },
  { label: "Security settings", path: "/settings/security" },
  { label: "System settings", path: "/settings/system" },
  { label: "Integration settings", path: "/settings/integrations" },
  { label: "Sales pipeline settings", path: "/settings/sales-pipeline" },
] as const;

type AuthState = "authenticated" | "database-unavailable";

type AuditFinding = {
  detail: string;
  label: string;
  path: string;
  severity: "error" | "warning";
  type:
    | "auth"
    | "blank"
    | "console"
    | "error-boundary"
    | "heading"
    | "network"
    | "overflow"
    | "status";
  viewport: string;
};

type OverflowResult = {
  documentWidth: number;
  offenders: Array<{
    right: number;
    selector: string;
    text: string;
    width: number;
  }>;
  overflow: number;
  viewportWidth: number;
};

test("public sign-in route renders", async ({ page }) => {
  await page.goto("/signin", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("authenticated route audit identifies render, network and layout gaps", async ({
  page,
}) => {
  test.setTimeout(300_000);

  const authState = await authenticate(page);

  test.skip(
    authState === "database-unavailable",
    "Skipping E2E audit because the local CRM database is unavailable.",
  );

  const findings: AuditFinding[] = [];

  for (const viewport of viewports) {
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });

    for (const route of auditedRoutes) {
      const consoleErrors: string[] = [];
      const networkFailures: string[] = [];

      const consoleHandler = (message: ConsoleMessage) => {
        if (message.type() !== "error") return;
        if (isIgnorableConsoleError(message.text())) return;

        consoleErrors.push(message.text().slice(0, 300));
      };
      const responseHandler = (response: Response) => {
        if (response.status() < 400) return;
        if (isExpectedBackgroundRequest(response.request())) return;

        networkFailures.push(`${response.status()} ${response.url()}`);
      };
      const requestFailedHandler = (request: Request) => {
        const failure = request.failure();

        if (!failure) return;
        if (isExpectedRequestAbort(request, failure.errorText)) return;

        networkFailures.push(`${failure.errorText} ${request.url()}`);
      };

      page.on("console", consoleHandler);
      page.on("response", responseHandler);
      page.on("requestfailed", requestFailedHandler);

      try {
        const response = await page
          .goto(route.path, { timeout: 30_000, waitUntil: "domcontentloaded" })
          .catch((error: unknown) => {
            findings.push({
              detail:
                error instanceof Error ? error.message : "Navigation failed.",
              label: route.label,
              path: route.path,
              severity: "error",
              type: "network",
              viewport: viewport.name,
            });

            return null;
          });

        await waitForPageSettle(page);

        if ((response?.status() ?? 0) >= 500) {
          findings.push({
            detail: `Document response status ${response?.status() ?? "unknown"}.`,
            label: route.label,
            path: route.path,
            severity: "error",
            type: "status",
            viewport: viewport.name,
          });
        }

        if (isSignInPath(page)) {
          findings.push({
            detail: "Route redirected to sign in after authentication.",
            label: route.label,
            path: route.path,
            severity: "error",
            type: "auth",
            viewport: viewport.name,
          });
          continue;
        }

        const bodyText = await page.locator("body").innerText();

        if (bodyText.trim().length < 20) {
          findings.push({
            detail: "Body content was empty or unexpectedly short.",
            label: route.label,
            path: route.path,
            severity: "error",
            type: "blank",
            viewport: viewport.name,
          });
        }

        if (
          /\b(?:page|workspace|settings|reports|sales|marketing|telephony|storage|contacts).+could not load\b/i.test(
            bodyText,
          ) ||
          /Error reference:/i.test(bodyText)
        ) {
          findings.push({
            detail: "Route rendered a shared error boundary or error digest.",
            label: route.label,
            path: route.path,
            severity: "error",
            type: "error-boundary",
            viewport: viewport.name,
          });
        }

        const headingCount = await page
          .locator("h1, h2, [role='heading']")
          .filter({ visible: true })
          .count();

        if (headingCount < 1) {
          findings.push({
            detail: "No visible page heading was found.",
            label: route.label,
            path: route.path,
            severity: "warning",
            type: "heading",
            viewport: viewport.name,
          });
        }

        const overflow = await measurePageOverflow(page);

        if (overflow.overflow > 2) {
          findings.push({
            detail: overflowMessage(overflow),
            label: route.label,
            path: route.path,
            severity: "error",
            type: "overflow",
            viewport: viewport.name,
          });
        }

        for (const consoleError of consoleErrors.slice(0, 5)) {
          findings.push({
            detail: consoleError,
            label: route.label,
            path: route.path,
            severity: "error",
            type: "console",
            viewport: viewport.name,
          });
        }

        for (const networkFailure of networkFailures.slice(0, 5)) {
          findings.push({
            detail: networkFailure,
            label: route.label,
            path: route.path,
            severity: "error",
            type: "network",
            viewport: viewport.name,
          });
        }
      } finally {
        page.off("console", consoleHandler);
        page.off("response", responseHandler);
        page.off("requestfailed", requestFailedHandler);
      }
    }
  }

  expect(findings, auditSummary(findings)).toEqual([]);
});

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
    "E2E audit could not sign in. Set E2E_EMAIL/E2E_PASSWORD or run the seed admin account.",
  );
}

function isSignInPath(page: Page) {
  return new URL(page.url()).pathname.startsWith("/signin");
}

function isIgnorableConsoleError(message: string) {
  return /^Failed to load resource: the server responded with a status of \d+ \([^)]+\)$/.test(
    message,
  );
}

function isExpectedRequestAbort(request: Request, errorText: string) {
  if (errorText !== "net::ERR_ABORTED") return false;
  if (request.isNavigationRequest()) return false;

  return (
    isExpectedBackgroundRequest(request) ||
    isExpectedStaticAssetAbort(request) ||
    getRequestPathname(request).startsWith("/_next/static/chunks/") ||
    getRequestPathname(request).startsWith("/__nextjs_font/")
  );
}

function isExpectedBackgroundRequest(request: Request) {
  const pathname = getRequestPathname(request);

  return (
    pathname.startsWith("/api/realtime/events") ||
    pathname.startsWith("/api/telephony/availability") ||
    pathname.startsWith("/api/telephony/desktop-presence") ||
    pathname.startsWith("/api/telephony/live-events") ||
    pathname.startsWith("/api/twilio/voice/token") ||
    pathname === "/api/build-info" ||
    pathname === "/api/health"
  );
}

function isExpectedStaticAssetAbort(request: Request) {
  const pathname = getRequestPathname(request);

  return pathname.startsWith("/images/") || pathname.startsWith("/_next/image");
}

function getRequestPathname(request: Request) {
  try {
    return new URL(request.url()).pathname;
  } catch {
    return "";
  }
}

async function waitForPageSettle(page: Page) {
  await page
    .waitForLoadState("domcontentloaded", { timeout: 5_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250).catch(() => undefined);
}

async function measurePageOverflow(page: Page): Promise<OverflowResult> {
  return page.evaluate(() => {
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
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => {
        const style = window.getComputedStyle(element);

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.right > viewportWidth + 2
        );
      })
      .slice(0, 5)
      .map(({ element, rect }) => {
        const id = element.id ? `#${element.id}` : "";
        const className =
          typeof element.className === "string"
            ? element.className
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 3)
                .map((value) => `.${value}`)
                .join("")
            : "";

        return {
          right: Math.round(rect.right),
          selector: `${element.tagName.toLowerCase()}${id}${className}`,
          text: (element.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80),
          width: Math.round(rect.width),
        };
      });

    return {
      documentWidth,
      offenders,
      overflow,
      viewportWidth,
    };
  });
}

function overflowMessage(result: OverflowResult) {
  const offenders = result.offenders.length
    ? ` Offenders: ${result.offenders
        .map(
          (offender) =>
            `${offender.selector} right=${offender.right} width=${offender.width} text="${offender.text}"`,
        )
        .join(" | ")}`
    : "";

  return `Document overflowed by ${result.overflow}px. Document width ${result.documentWidth}px, viewport ${result.viewportWidth}px.${offenders}`;
}

function auditSummary(findings: AuditFinding[]) {
  if (!findings.length) {
    return "E2E route audit passed with no findings.";
  }

  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  const lines = findings.map(
    (finding) =>
      `- [${finding.severity}] ${finding.viewport} ${finding.label} (${finding.path}) ${finding.type}: ${finding.detail}`,
  );

  return `E2E route audit found ${errors.length} error(s) and ${warnings.length} warning(s):\n${lines.join("\n")}`;
}
