import { purgeExpiredAttributionData } from "@/lib/attribution/retention";

function authorized(request: Request) {
  const secret = process.env.ATTRIBUTION_RETENTION_SECRET || process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  const header = request.headers.get("authorization");
  const token = request.headers.get("x-cron-secret");

  return header === `Bearer ${secret}` || token === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await purgeExpiredAttributionData({
    actorId: null,
    trigger: "api",
  });

  return Response.json({
    ok: true,
    purgedAt: new Date().toISOString(),
    cutoff: result.cutoff.toISOString(),
    retentionDays: result.retentionDays,
    deleted: {
      snapshots: result.snapshots,
      records: result.records,
      numberAssignments: result.assignments,
      debugEvents: result.debugEvents,
    },
  });
}

export async function GET(request: Request) {
  return POST(request);
}
