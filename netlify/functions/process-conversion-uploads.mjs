export const config = {
  schedule: "*/30 * * * *",
};

function booleanEnv(name, defaultValue = false) {
  const value = (process.env[name] || "").trim().toLowerCase();
  if (!value) return defaultValue;

  return ["1", "true", "yes", "on"].includes(value);
}

function numberEnv(name, defaultValue) {
  const value = Number(process.env[name] || "");
  if (!Number.isFinite(value)) return defaultValue;

  return Math.min(Math.max(Math.floor(value), 1), 250);
}

export default async function handler() {
  if (!booleanEnv("MARKETING_UPLOAD_CRON_ENABLED")) {
    return Response.json({
      ok: true,
      skipped: true,
      message: "Scheduled conversion uploads are disabled.",
    });
  }

  const secret = process.env.MARKETING_UPLOAD_CRON_SECRET;
  if (!secret) {
    return Response.json(
      {
        ok: false,
        error: "MARKETING_UPLOAD_CRON_SECRET is required.",
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

  const url = new URL("/api/marketing/conversion-uploads/process", baseUrl);
  url.searchParams.set("limit", String(numberEnv("MARKETING_UPLOAD_CRON_LIMIT", 50)));
  url.searchParams.set(
    "prepare",
    booleanEnv("MARKETING_UPLOAD_CRON_PREPARE", true) ? "1" : "0",
  );
  url.searchParams.set(
    "dryRun",
    booleanEnv("MARKETING_UPLOAD_CRON_DRY_RUN") ? "1" : "0",
  );

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "iD30 CRM scheduled conversion upload",
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
