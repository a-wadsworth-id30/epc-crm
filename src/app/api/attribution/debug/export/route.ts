import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const exportLimit = 5000;

export async function GET() {
  await requireAdmin();

  const rows = await prisma.attributionDebugEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: exportLimit,
    select: {
      createdAt: true,
      eventType: true,
      level: true,
      message: true,
      hostname: true,
      origin: true,
      path: true,
      visitorId: true,
      sessionId: true,
      ipAddress: true,
      userAgent: true,
      metadata: true,
    },
  });

  const csv = toCsv([
    [
      "Created at",
      "Level",
      "Event type",
      "Message",
      "Hostname",
      "Origin",
      "Path",
      "Visitor ID",
      "Session ID",
      "IP address",
      "User agent",
      "Config enabled",
      "Registered domain",
      "Decision reason",
      "Metadata",
    ],
    ...rows.map((row) => {
      const decision = configDecision(row.metadata);

      return [
        row.createdAt.toISOString(),
        row.level,
        row.eventType,
        row.message ?? "",
        row.hostname ?? "",
        row.origin ?? "",
        row.path ?? "",
        row.visitorId ?? "",
        row.sessionId ?? "",
        row.ipAddress ?? "",
        row.userAgent ?? "",
        decision.enabled,
        decision.registered,
        decision.reason,
        jsonString(row.metadata),
      ];
    }),
  ]);

  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="attribution-debug-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

function configDecision(metadata: unknown) {
  const record = jsonObject(metadata);

  return {
    enabled: booleanLabel(record?.enabled),
    registered: booleanLabel(record?.registered),
    reason: stringValue(record?.reason),
  };
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanLabel(value: unknown) {
  if (typeof value !== "boolean") return "";
  return value ? "Yes" : "No";
}

function jsonString(value: unknown) {
  if (value === null || typeof value === "undefined") return "";

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
