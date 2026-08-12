export const config = {
  schedule: "30 2 * * *",
};

function booleanEnv(name, defaultValue = false) {
  const value = (process.env[name] || "").trim().toLowerCase();
  if (!value) return defaultValue;

  return ["1", "true", "yes", "on"].includes(value);
}

export default async function handler() {
  if (!booleanEnv("OPERATIONAL_RETENTION_CRON_ENABLED")) {
    return Response.json({
      ok: true,
      skipped: true,
      message: "Scheduled operational retention is disabled.",
    });
  }

  const secret = process.env.OPERATIONAL_RETENTION_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      {
        ok: false,
        error: "OPERATIONAL_RETENTION_SECRET or CRON_SECRET is required.",
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

  const url = new URL("/api/maintenance/retention", baseUrl);
  url.searchParams.set(
    "dryRun",
    booleanEnv("OPERATIONAL_RETENTION_CRON_DRY_RUN") ? "1" : "0",
  );

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "iD30 CRM scheduled operational retention",
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
