export const config = { schedule: "*/10 * * * *" };

export default async function handler() {
  const secret = process.env.ID30_AUTH_CANARY_SECRET || process.env.CRON_SECRET;
  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.URL;
  if (!secret || !base) return Response.json({ ok: false, message: "Canary runtime is not configured." }, { status: 500 });

  const url = new URL("/api/maintenance/id30-auth-canary", base);
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { authorization: `Bearer ${secret}`, "user-agent": "iD30 cross-system canary" },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => null);
  const summary = {
    durationMs: Number.isFinite(body?.durationMs) ? body.durationMs : null,
    ok: response.ok,
    roundTrip: body?.roundTrip === true,
    status: response.status,
  };
  if (response.ok) console.info("iD30 cross-system canary succeeded", summary);
  else console.error("iD30 cross-system canary failed", summary);
  return Response.json(summary, { status: response.ok ? 200 : 502 });
}
