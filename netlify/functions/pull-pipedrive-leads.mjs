export const config = {
  schedule: "*/15 * * * *",
};

function booleanEnv(name, defaultValue = false) {
  const value = (process.env[name] || "").trim().toLowerCase();
  if (!value) return defaultValue;

  return ["1", "true", "yes", "on"].includes(value);
}

export default async function handler() {
  if (!booleanEnv("PIPEDRIVE_LEAD_IMPORT_CRON_ENABLED")) {
    return Response.json({
      ok: true,
      skipped: true,
      message: "Scheduled Pipedrive lead import is disabled.",
    });
  }

  const secret =
    process.env.PIPEDRIVE_LEAD_IMPORT_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      {
        ok: false,
        error: "PIPEDRIVE_LEAD_IMPORT_SECRET or CRON_SECRET is required.",
      },
      { status: 500 },
    );
  }

  const baseUrl = (
    process.env.APP_BASE_URL ||
    process.env.URL ||
    process.env.DEPLOY_URL ||
    ""
  ).replace(/\/$/, "");

  if (!baseUrl) {
    return Response.json(
      {
        ok: false,
        error: "APP_BASE_URL or URL is required.",
      },
      { status: 500 },
    );
  }

  const url = new URL("/api/maintenance/pipedrive-lead-import", baseUrl);
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
