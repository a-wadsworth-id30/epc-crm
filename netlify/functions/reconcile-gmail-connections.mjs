export const config = {
  schedule: "*/15 * * * *",
};

function crmBaseUrl() {
  const candidates = [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.URL,
    process.env.DEPLOY_URL,
  ];

  for (const rawValue of candidates) {
    const value = (rawValue || "").trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:") return url;
    } catch {
      // Try the next configured Netlify URL.
    }
  }
  return null;
}

export default async function handler() {
  const secret = process.env.GMAIL_SYNC_SECRET || process.env.CRON_SECRET;
  const baseUrl = crmBaseUrl();
  if (!secret || !baseUrl) {
    console.error("Gmail connection reconciliation skipped", {
      reason: !secret ? "missing-secret" : "missing-base-url",
    });
    return Response.json(
      { ok: false, message: "Gmail reconciliation runtime is not configured." },
      { status: 500 },
    );
  }

  const url = new URL("/api/maintenance/gmail-connections", baseUrl);
  url.searchParams.set("limit", "25");
  url.searchParams.set("timeBudgetMs", "20000");
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "iD30 CRM Gmail connection reconciliation",
    },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => null);
  const summary = {
    changed: Number.isFinite(body?.changed) ? body.changed : null,
    checked: Number.isFinite(body?.checked) ? body.checked : null,
    failed: Number.isFinite(body?.failed) ? body.failed : null,
    status: response.status,
  };

  if (response.ok) {
    console.info("Gmail connection reconciliation completed", summary);
  } else {
    console.error("Gmail connection reconciliation failed", summary);
  }
  return Response.json(
    { ok: response.ok, summary },
    { status: response.ok ? 200 : 502 },
  );
}
