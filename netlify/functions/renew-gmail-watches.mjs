export const config = {
  schedule: "17 * * * *",
};

function booleanEnv(name, defaultValue = false) {
  const value = (process.env[name] || "").trim().toLowerCase();
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value);
}

function integerEnv(name, defaultValue, maximum) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return defaultValue;
  return Math.min(Math.max(Math.trunc(value), 1), maximum);
}

function crmBaseUrl() {
  for (const [source, rawValue] of [
    ["APP_BASE_URL", process.env.APP_BASE_URL],
    ["NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL],
    ["URL", process.env.URL],
    ["DEPLOY_URL", process.env.DEPLOY_URL],
  ]) {
    const value = (rawValue || "").trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:") {
        return { source, url: url.href.replace(/\/$/, "") };
      }
    } catch {
      // Continue to the next Netlify URL candidate.
    }
  }
  return null;
}

export default async function handler() {
  if (!booleanEnv("GMAIL_PUSH_ENABLED")) {
    console.info("Scheduled Gmail watch renewal skipped", { reason: "disabled" });
    return Response.json({
      ok: true,
      skipped: true,
      message: "Scheduled Gmail push renewal is disabled.",
    });
  }

  const secret = process.env.GMAIL_SYNC_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    console.error("Scheduled Gmail watch renewal failed", {
      reason: "missing-secret",
    });
    return Response.json(
      { ok: false, error: "GMAIL_SYNC_SECRET or CRON_SECRET is required." },
      { status: 500 },
    );
  }

  const baseUrl = crmBaseUrl();
  if (!baseUrl) {
    return Response.json(
      { ok: false, error: "A valid HTTPS CRM base URL is required." },
      { status: 500 },
    );
  }

  const url = new URL("/api/maintenance/gmail-watch", baseUrl.url);
  url.searchParams.set(
    "limit",
    String(integerEnv("GMAIL_WATCH_RENEWAL_LIMIT", 10, 25)),
  );
  url.searchParams.set("timeBudgetMs", "20000");
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "iD30 CRM scheduled Gmail watch renewal",
    },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => null);
  const summary = {
    deferred: Number.isFinite(body?.deferred) ? body.deferred : null,
    failed: Number.isFinite(body?.failed) ? body.failed : null,
    processed: Number.isFinite(body?.processed) ? body.processed : null,
    renewed: Number.isFinite(body?.renewed) ? body.renewed : null,
  };

  if (response.ok) {
    console.info("Scheduled Gmail watch renewal completed", summary);
  } else {
    console.error("Scheduled Gmail watch renewal failed", summary);
  }

  return Response.json(
    { endpoint: url.pathname, ok: response.ok, status: response.status, summary },
    { status: response.ok ? 200 : 502 },
  );
}
