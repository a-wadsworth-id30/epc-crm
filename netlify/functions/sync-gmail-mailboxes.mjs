export const config = {
  schedule: "*/10 * * * *",
};

function booleanEnv(name, defaultValue = false) {
  const value = (process.env[name] || "").trim().toLowerCase();
  if (!value) return defaultValue;

  return ["1", "true", "yes", "on"].includes(value);
}

function crmBaseUrl() {
  const candidates = [
    ["APP_BASE_URL", process.env.APP_BASE_URL],
    ["NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL],
    ["URL", process.env.URL],
    ["DEPLOY_URL", process.env.DEPLOY_URL],
  ];

  for (const [source, rawValue] of candidates) {
    const value = (rawValue || "").trim();
    if (!value) continue;

    try {
      const url = new URL(value);
      if (url.protocol !== "https:") continue;

      return {
        source,
        url: url.href.replace(/\/$/, ""),
      };
    } catch {
      // Ignore malformed values and continue to the next Netlify URL source.
    }
  }

  return null;
}

function compactSyncResult(body) {
  const results = Array.isArray(body?.results) ? body.results : [];

  return {
    failed: Number.isFinite(body?.failed) ? body.failed : null,
    processed: Number.isFinite(body?.processed) ? body.processed : null,
    succeeded: results.filter((result) => result?.ok === true).length,
  };
}

export default async function handler() {
  if (!booleanEnv("GMAIL_SYNC_CRON_ENABLED")) {
    console.info("Scheduled Gmail sync skipped", { reason: "disabled" });

    return Response.json({
      ok: true,
      skipped: true,
      message: "Scheduled Gmail sync is disabled.",
    });
  }

  const secret = process.env.GMAIL_SYNC_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    console.error("Scheduled Gmail sync failed", {
      reason: "missing-secret",
    });

    return Response.json(
      {
        ok: false,
        error: "GMAIL_SYNC_SECRET or CRON_SECRET is required.",
      },
      { status: 500 },
    );
  }

  const baseUrl = crmBaseUrl();
  if (!baseUrl) {
    console.error("Scheduled Gmail sync failed", {
      reason: "missing-valid-base-url",
    });

    return Response.json(
      {
        ok: false,
        error:
          "A valid https APP_BASE_URL, NEXT_PUBLIC_APP_URL, URL or DEPLOY_URL is required.",
      },
      { status: 500 },
    );
  }

  const url = new URL("/api/maintenance/gmail-sync", baseUrl.url);
  url.searchParams.set("mailboxLimit", "1");
  url.searchParams.set("maxResults", "10");
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "iD30 CRM scheduled Gmail sync",
      "x-crm-job-trigger": "scheduled",
    },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => null);
  const summary = {
    baseUrlSource: baseUrl.source,
    endpoint: url.pathname,
    ok: response.ok,
    status: response.status,
    ...compactSyncResult(body),
  };

  if (response.ok) {
    console.info("Scheduled Gmail sync completed", summary);
  } else {
    console.error("Scheduled Gmail sync failed", summary);
  }

  return Response.json(
    {
      ok: response.ok,
      status: response.status,
      endpoint: url.pathname,
      summary: compactSyncResult(body),
    },
    { status: response.ok ? 200 : 502 },
  );
}
