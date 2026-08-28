import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const checkSchema = z.object({
  websiteUrl: z.string().trim().url(),
});

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

type BrowserCheckResult = {
  attempted: boolean;
  available: boolean;
  scriptApiPresent: boolean;
  configLoaded: boolean;
  configUrl: string | null;
  configApiBase: string | null;
  configEnabled: boolean | null;
  configReason: string | null;
  hiddenFieldInjected: boolean;
  phoneNumberApplied: boolean;
  debugApiPresent: boolean;
  runtimeScriptSrcs: string[];
  errors: string[];
};

type ServerConfigCheckResult = {
  attempted: boolean;
  configLoaded: boolean;
  configUrl: string | null;
  configApiBase: string | null;
  configEnabled: boolean | null;
  configReason: string | null;
  errors: string[];
};

function appBaseUrl() {
  const fallbackBaseUrl = ["https://crm", "epc-improvements.co.uk"].join(".");

  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    fallbackBaseUrl
  ).replace(/\/$/, "");
}

function localInstallChecksAllowed() {
  return process.env.NODE_ENV !== "production";
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

function ipv4Octets(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => Number(part));
  return octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? octets
    : null;
}

function isBlockedIpv4(value: string) {
  const octets = ipv4Octets(value);
  if (!octets) return true;

  const [first, second, third] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first === 224 ||
    first >= 240
  );
}

function isBlockedIpAddress(address: string) {
  if (isIP(address) === 4) {
    return isBlockedIpv4(address);
  }

  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return isBlockedIpv4(normalized.replace("::ffff:", ""));
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff")
  );
}

async function assertSafeAttributionCheckUrl(value: string) {
  const url = new URL(value);

  if (url.username || url.password) {
    throw new Error("Website URL must not include credentials.");
  }

  if (url.protocol !== "https:") {
    if (!localInstallChecksAllowed() || url.protocol !== "http:") {
      throw new Error("Website URL must use HTTPS.");
    }
  }

  if (localInstallChecksAllowed()) {
    return url;
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (isBlockedHostname(hostname)) {
    throw new Error("Website URL must use a public hostname.");
  }

  if (isIP(hostname) && isBlockedIpAddress(hostname)) {
    throw new Error("Website URL must use a public IP address.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIpAddress(address))) {
    throw new Error("Website URL resolved to a blocked private or reserved network address.");
  }

  return url;
}

async function guardedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  let currentUrl = await assertSafeAttributionCheckUrl(url);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl.href, {
        ...init,
        signal: controller.signal,
        redirect: "manual",
      });

      if (!REDIRECT_STATUSES.has(response.status)) {
        return { response, url: currentUrl.href };
      }

      const location = response.headers.get("location");
      if (!location) {
        return { response, url: currentUrl.href };
      }

      currentUrl = await assertSafeAttributionCheckUrl(
        new URL(location, currentUrl).href,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Website redirected too many times.");
}

async function fetchText(url: string, timeoutMs = 8000) {
  const { response, url: resolvedUrl } = await guardedFetch(
    url,
    {
      headers: {
        "user-agent": "iD30 CRM attribution checker",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    },
    timeoutMs,
  );
  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    url: resolvedUrl,
    text,
  };
}

async function fetchJson(url: string, websiteUrl: string, timeoutMs = 5000) {
  const { response, url: resolvedUrl } = await guardedFetch(
    url,
    {
      headers: {
        "user-agent": "iD30 CRM attribution checker",
        accept: "application/json",
        origin: new URL(websiteUrl).origin,
        referer: websiteUrl,
      },
    },
    timeoutMs,
  );
  const json = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    url: resolvedUrl,
    json,
  };
}

function scriptSrcs(html: string) {
  return Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)).map(
    (match) => match[1],
  );
}

function dataApiBases(html: string) {
  return Array.from(
    html.matchAll(/\bdata-api-base=["']([^"']+)["']/gi),
  ).map((match) => match[1]);
}

function normaliseUrl(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value).href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normaliseOrigin(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

function normaliseHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/:?#]/)[0];
  }
}

function resolveUrl(value: string | null, baseUrl: string) {
  if (!value) return null;

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function isAttributionScriptSrc(src: string, baseUrl: string) {
  const resolved = resolveUrl(src, baseUrl);
  if (!resolved) return false;

  try {
    return new URL(resolved).pathname.endsWith("/attribution.js");
  } catch {
    return false;
  }
}

function attributionConfigUrl(value: string) {
  try {
    return new URL(value).pathname === "/api/attribution/config";
  } catch {
    return value.includes("/api/attribution/config");
  }
}

function importantAttributionRequest(value: string) {
  try {
    const url = new URL(value);
    return (
      url.pathname.endsWith("/attribution.js") ||
      url.pathname === "/api/attribution/config"
    );
  } catch {
    return value.includes("/attribution.js") || value.includes("/api/attribution/config");
  }
}

async function headReachable(url: string | null) {
  if (!url) return false;

  return guardedFetch(url, { method: "HEAD" }, 5000)
    .then(({ response }) => response.ok)
    .catch(() => false);
}

function configEndpointUrl(
  dataApiBase: string | null,
  resolvedAttributionScriptSrc: string | null,
  baseUrl: string,
) {
  const source = dataApiBase || resolvedAttributionScriptSrc || baseUrl;

  try {
    return new URL("/api/attribution/config", source).href;
  } catch {
    return `${baseUrl}/api/attribution/config`;
  }
}

async function runServerConfigCheck(
  websiteUrl: string,
  configUrl: string,
): Promise<ServerConfigCheckResult> {
  const result: ServerConfigCheckResult = {
    attempted: true,
    configLoaded: false,
    configUrl,
    configApiBase: null,
    configEnabled: null,
    configReason: null,
    errors: [],
  };

  try {
    const response = await fetchJson(configUrl, websiteUrl);

    result.configUrl = response.url;
    if (!response.ok) {
      result.errors.push(`Config endpoint returned HTTP ${response.status}: ${response.url}`);
      return result;
    }

    if (!response.json || typeof response.json !== "object" || Array.isArray(response.json)) {
      result.errors.push("Config endpoint returned unreadable JSON.");
      return result;
    }

    const config = response.json as {
      enabled?: unknown;
      apiBase?: unknown;
      domain?: {
        reason?: unknown;
      };
    };

    result.configLoaded = true;
    result.configEnabled = config.enabled === true;
    result.configApiBase = typeof config.apiBase === "string" ? config.apiBase : null;
    result.configReason =
      config.domain && typeof config.domain.reason === "string"
        ? config.domain.reason
        : null;
  } catch (error) {
    result.errors.push(
      error instanceof Error
        ? `Config endpoint request failed: ${error.message}`
        : "Config endpoint request failed.",
    );
  }

  return result;
}

function skippedBrowserCheck(message: string): BrowserCheckResult {
  return {
    attempted: false,
    available: false,
    scriptApiPresent: false,
    configLoaded: false,
    configUrl: null,
    configApiBase: null,
    configEnabled: null,
    configReason: null,
    hiddenFieldInjected: false,
    phoneNumberApplied: false,
    debugApiPresent: false,
    runtimeScriptSrcs: [],
    errors: [message],
  };
}

async function runBrowserCheck(websiteUrl: string): Promise<BrowserCheckResult> {
  const unavailable = (message: string): BrowserCheckResult => ({
    attempted: true,
    available: false,
    scriptApiPresent: false,
    configLoaded: false,
    configUrl: null,
    configApiBase: null,
    configEnabled: null,
    configReason: null,
    hiddenFieldInjected: false,
    phoneNumberApplied: false,
    debugApiPresent: false,
    runtimeScriptSrcs: [],
    errors: [message],
  });

  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    return unavailable("Browser execution is unavailable on this server.");
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent: "iD30 CRM attribution browser checker",
    });
    const errors: string[] = [];
    let configLoaded = false;
    let configUrl: string | null = null;
    let configApiBase: string | null = null;
    let configEnabled: boolean | null = null;
    let configReason: string | null = null;

    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();

      if (/^https?:\/\//i.test(requestUrl)) {
        try {
          await assertSafeAttributionCheckUrl(requestUrl);
        } catch {
          await route.abort("blockedbyclient");
          return;
        }
      }

      await route.continue();
    });

    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => {
      const url = request.url();
      if (importantAttributionRequest(url)) {
        errors.push(`${request.failure()?.errorText || "Request failed"}: ${url}`);
      }
    });
    page.on("response", async (response) => {
      if (!attributionConfigUrl(response.url())) {
        return;
      }

      configUrl = response.url();
      if (!response.ok()) {
        errors.push(`Config endpoint returned HTTP ${response.status()}: ${response.url()}`);
        return;
      }

      try {
        const config = await response.json();
        configLoaded = true;
        configApiBase = typeof config.apiBase === "string" ? config.apiBase : null;
        configEnabled = config.enabled === true;
        configReason =
          config.domain && typeof config.domain.reason === "string"
            ? config.domain.reason
            : null;
      } catch {
        errors.push("Config endpoint returned unreadable JSON.");
      }
    });

    await page.goto(websiteUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
    await page.waitForTimeout(2500);

    const runtime = await page.evaluate(() => {
      const api = (window as typeof window & {
        id30Attribution?: {
          get?: () => unknown;
          hasConsent?: () => boolean;
          grantConsent?: () => unknown;
          revokeConsent?: () => unknown;
        };
      }).id30Attribution;
      const scriptElements = Array.from(
        document.querySelectorAll("script[data-id30-attribution], script[src]"),
      ) as HTMLScriptElement[];
      const hiddenField = document.querySelector(
        'input[name="crm_attribution"], input[name="attribution"]',
      ) as HTMLInputElement | null;
      const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));
      const phoneTargets = Array.from(
        document.querySelectorAll("[data-crm-phone], [data-attribution-phone]"),
      );

      return {
        scriptApiPresent: Boolean(api),
        debugApiPresent: Boolean(api?.get && api?.hasConsent),
        runtimeScriptSrcs: scriptElements
          .map((script) => script.src || script.getAttribute("src") || "")
          .filter((src) => src.includes("/attribution.js")),
        hiddenFieldInjected: Boolean(hiddenField?.value),
        phoneNumberApplied: phoneTargets.some((element) =>
          Boolean(element.textContent?.trim()),
        ) || telLinks.some((element) => Boolean(element.getAttribute("href")?.replace(/^tel:/, ""))),
      };
    });

    return {
      attempted: true,
      available: true,
      scriptApiPresent: runtime.scriptApiPresent,
      configLoaded,
      configUrl,
      configApiBase,
      configEnabled,
      configReason,
      hiddenFieldInjected: runtime.hiddenFieldInjected,
      phoneNumberApplied: runtime.phoneNumberApplied,
      debugApiPresent: runtime.debugApiPresent,
      runtimeScriptSrcs: runtime.runtimeScriptSrcs,
      errors,
    };
  } catch (error) {
    return unavailable(
      error instanceof Error
        ? error.message
        : "Browser execution failed for this website.",
    );
  } finally {
    await browser?.close().catch(() => null);
  }
}

export async function POST(request: Request) {
  const user = await requireAdmin();

  const payload = await request.json().catch(() => ({}));
  const parsed = checkSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json({ error: "Enter a valid website URL." }, { status: 400 });
  }

  try {
    await assertSafeAttributionCheckUrl(parsed.data.websiteUrl);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Website URL is not allowed.",
      },
      { status: 400 },
    );
  }

  const baseUrl = appBaseUrl();
  const scriptUrl = `${baseUrl}/attribution.js`;
  let page;
  let baseScriptReachable = false;

  try {
    [page, baseScriptReachable] = await Promise.all([
      fetchText(parsed.data.websiteUrl),
      headReachable(scriptUrl),
    ]);
  } catch {
    return Response.json(
      { error: "Could not fetch that website. Check the URL and try again." },
      { status: 400 },
    );
  }

  const html = page.text;
  const srcs = scriptSrcs(html);
  const attributionScriptSrc =
    srcs.find((src) => isAttributionScriptSrc(src, page.url)) ?? null;
  const resolvedAttributionScriptSrc = resolveUrl(attributionScriptSrc, page.url);
  const apiBases = dataApiBases(html);
  const serverConfigCheck = await runServerConfigCheck(
    page.url,
    configEndpointUrl(apiBases[0] ?? null, resolvedAttributionScriptSrc, baseUrl),
  );
  const installedScriptReachable =
    resolvedAttributionScriptSrc === scriptUrl
      ? baseScriptReachable
      : await headReachable(resolvedAttributionScriptSrc);
  const scriptReachable = baseScriptReachable || installedScriptReachable;
  const hasDataMarker = /data-id30-attribution\b/i.test(html);
  const phoneMarkers = (
    html.match(/data-(crm-phone|attribution-phone|crm-tel|attribution-tel)\b/gi) ?? []
  ).length;
  const telLinks = (html.match(/href=["']tel:/gi) ?? []).length;
  const likelyPhoneText = (html.match(/(?:\+?\d[\d\s().-]{8,}\d)/g) ?? []).length;
  const formMarkers = (html.match(/\bname=["'](crm_attribution|attribution)["']/gi) ?? [])
    .length;
  const forms = (html.match(/<form\b/gi) ?? []).length;
  const issues: string[] = [];

  if (!page.ok) {
    issues.push(`The page returned HTTP ${page.status}.`);
  }

  if (!scriptReachable) {
    issues.push(`The CRM script is not reachable at ${scriptUrl}.`);
  }

  if (!serverConfigCheck.configLoaded) {
    issues.push(
      serverConfigCheck.errors[0] ||
        "The config endpoint could not be checked from the CRM server.",
    );
  }

  if (serverConfigCheck.configLoaded && serverConfigCheck.configEnabled === false) {
    issues.push(
      `The config endpoint disabled tracking for this page${
        serverConfigCheck.configReason ? ` (${serverConfigCheck.configReason})` : ""
      }.`,
    );
  }

  if (phoneMarkers === 0 && telLinks === 0 && likelyPhoneText === 0) {
    issues.push("No telephone numbers were detected. This is OK if the site has no phone number.");
  }

  const browserCheck =
    process.env.ATTRIBUTION_INSTALL_BROWSER_CHECK === "true"
      ? await runBrowserCheck(page.url)
      : skippedBrowserCheck(
          "Browser execution skipped; server-side script and config checks were used.",
        );
  const runtimeScriptInstalled =
    browserCheck.available &&
    (browserCheck.runtimeScriptSrcs.length > 0 || browserCheck.scriptApiPresent);
  const scriptInstalled = Boolean(attributionScriptSrc || hasDataMarker || runtimeScriptInstalled);
  const baseOrigin = normaliseOrigin(baseUrl);
  const staticScriptOrigin = normaliseOrigin(resolvedAttributionScriptSrc);
  const runtimeScriptOrigins = browserCheck.runtimeScriptSrcs
    .map((src) => normaliseOrigin(src))
    .filter((origin): origin is string => Boolean(origin));
  const configOrigin = normaliseOrigin(browserCheck.configUrl);
  const configApiBaseOrigin = normaliseOrigin(browserCheck.configApiBase);
  const serverConfigOrigin = normaliseOrigin(serverConfigCheck.configUrl);
  const serverConfigApiBaseOrigin = normaliseOrigin(serverConfigCheck.configApiBase);
  const dataApiBaseMatches = apiBases.some(
    (value) => normaliseUrl(value) === normaliseUrl(baseUrl),
  );
  const serverConfirmedScriptOrigin =
    serverConfigCheck.configLoaded &&
    serverConfigCheck.configEnabled === true &&
    Boolean(serverConfigOrigin && staticScriptOrigin === serverConfigOrigin);
  const browserConfirmedScriptOrigin =
    browserCheck.available &&
    browserCheck.configLoaded &&
    browserCheck.configEnabled === true &&
    browserCheck.scriptApiPresent &&
    Boolean(
      configOrigin &&
        [staticScriptOrigin, ...runtimeScriptOrigins].filter(Boolean).includes(configOrigin),
    );
  const correctApiBase =
    dataApiBaseMatches ||
    staticScriptOrigin === baseOrigin ||
    serverConfigOrigin === baseOrigin ||
    serverConfigApiBaseOrigin === baseOrigin ||
    serverConfirmedScriptOrigin ||
    configOrigin === baseOrigin ||
    configApiBaseOrigin === baseOrigin ||
    browserConfirmedScriptOrigin;

  if (!scriptInstalled) {
    issues.push("No /attribution.js script tag was found on the page.");
  }

  if (scriptInstalled && !correctApiBase) {
    issues.push(`The script was found, but it is not clearly pointing at ${baseUrl}.`);
  }

  if (browserCheck.attempted && !browserCheck.available) {
    issues.push(`Browser execution could not run: ${browserCheck.errors[0]}`);
  }

  if (browserCheck.available && !browserCheck.scriptApiPresent) {
    issues.push("The page loaded in a browser, but window.id30Attribution was not available.");
  }

  if (browserCheck.available && scriptInstalled && !browserCheck.configLoaded) {
    issues.push("The browser did not observe a config endpoint request.");
  }

  if (browserCheck.available && browserCheck.configLoaded && browserCheck.configEnabled === false) {
    issues.push(
      `The config endpoint disabled tracking for this page${
        browserCheck.configReason ? ` (${browserCheck.configReason})` : ""
      }.`,
    );
  }

  const browserOk =
    !browserCheck.attempted ||
    !browserCheck.available ||
    (browserCheck.scriptApiPresent &&
      browserCheck.configLoaded &&
      browserCheck.configEnabled === true);
  const configOk = serverConfigCheck.configLoaded && serverConfigCheck.configEnabled === true;
  const ok =
    page.ok &&
    scriptReachable &&
    scriptInstalled &&
    correctApiBase &&
    configOk &&
    browserOk;
  const domain = normaliseHostname(page.url);
  const attributionDomain = await prisma.attributionDomain
    .findUnique({
      where: { domain },
      select: { id: true },
    })
    .catch(() => null);

  await prisma.attributionDomain
    .updateMany({
      where: { domain },
      data: {
        lastInstallCheckAt: new Date(),
        lastInstallStatus: ok ? "passed" : "failed",
        lastInstallUrl: page.url,
      },
    })
    .catch(() => null);
  await prisma.attributionInstallCheck
    .create({
      data: {
        attributionDomainId: attributionDomain?.id ?? null,
        domain,
        checkedUrl: page.url,
        status: ok ? "passed" : "failed",
        httpStatus: page.status,
        ok,
        scriptReachable,
        scriptInstalled,
        correctApiBase,
        browserCheck: JSON.parse(JSON.stringify(browserCheck)),
        issues,
        checkedByUserId: user.id,
      },
    })
    .catch((error) => {
      console.error("Failed to save attribution install check", error);
    });

  return Response.json({
    ok,
    checkedUrl: page.url,
    status: page.status,
    scriptReachable,
    scriptInstalled,
    correctApiBase,
    phoneMarkers,
    telLinks,
    likelyPhoneText,
    formMarkers,
    forms,
    foundScriptSrc: attributionScriptSrc,
    serverConfigCheck,
    browserCheck,
    issues,
  });
}
