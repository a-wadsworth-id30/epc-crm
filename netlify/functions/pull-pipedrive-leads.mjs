export const config = {
  schedule: "*/15 * * * *",
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

function compactImportResult(body) {
  const result = body && typeof body === "object" ? body.result : null;
  const record = result && typeof result === "object" ? result : {};

  return {
    created: Number.isFinite(record.created) ? record.created : null,
    linkedExisting: Number.isFinite(record.linkedExisting)
      ? record.linkedExisting
      : null,
    mode: typeof record.mode === "string" ? record.mode : null,
    moreAvailable:
      typeof record.moreAvailable === "boolean" ? record.moreAvailable : null,
    pagesRead: Number.isFinite(record.pagesRead) ? record.pagesRead : null,
    recordsRead: Number.isFinite(record.recordsRead) ? record.recordsRead : null,
    recordsWritten: Number.isFinite(record.recordsWritten)
      ? record.recordsWritten
      : null,
    skipped: Number.isFinite(record.skipped) ? record.skipped : null,
    status: typeof record.status === "string" ? record.status : null,
    warningCount: Number.isFinite(record.warningCount)
      ? record.warningCount
      : null,
  };
}

export default async function handler() {
  if (!booleanEnv("PIPEDRIVE_LEAD_IMPORT_CRON_ENABLED")) {
    console.info("Scheduled Pipedrive lead import skipped", {
      reason: "disabled",
    });

    return Response.json({
      ok: true,
      skipped: true,
      message: "Scheduled Pipedrive lead import is disabled.",
    });
  }

  const secret =
    process.env.PIPEDRIVE_LEAD_IMPORT_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    console.error("Scheduled Pipedrive lead import failed", {
      reason: "missing-secret",
    });

    return Response.json(
      {
        ok: false,
        error: "PIPEDRIVE_LEAD_IMPORT_SECRET or CRON_SECRET is required.",
      },
      { status: 500 },
    );
  }

  const baseUrl = crmBaseUrl();

  if (!baseUrl) {
    console.error("Scheduled Pipedrive lead import failed", {
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

  const url = new URL("/api/maintenance/pipedrive-lead-import", baseUrl.url);
  url.searchParams.set(
    "dryRun",
    booleanEnv("PIPEDRIVE_LEAD_IMPORT_CRON_DRY_RUN") ? "1" : "0",
  );

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "iD30 CRM scheduled Pipedrive lead import",
      "x-crm-job-trigger": "scheduled",
    },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => null);
  const summary = {
    baseUrlSource: baseUrl.source,
    dryRun: url.searchParams.get("dryRun") === "1",
    endpoint: url.pathname,
    ok: response.ok,
    status: response.status,
    ...compactImportResult(body),
  };

  if (response.ok) {
    console.info("Scheduled Pipedrive lead import completed", summary);
  } else {
    console.error("Scheduled Pipedrive lead import failed", summary);
  }

  return Response.json(
    {
      ok: response.ok,
      status: response.status,
      endpoint: url.pathname,
      body,
    },
    { status: response.ok ? 200 : 502 },
  );
}
