import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  callDirectionFilters,
  callLogPageSizeOptions,
  callStatusFilters,
  defaultCallLogPageSize,
  type CallDirectionFilter,
  type CallLogEntry,
  type CallLogPage,
  type CallStatusFilter,
  type MonitoringView,
} from "@/lib/telephony/call-log-shared";

export type {
  CallDirectionFilter,
  CallLogEntry,
  CallLogPage,
  CallStatusFilter,
  MonitoringView,
} from "@/lib/telephony/call-log-shared";

const callLogSelect = {
  id: true,
  direction: true,
  status: true,
  fromNumber: true,
  toNumber: true,
  fromIdentity: true,
  toIdentity: true,
  parentCallSid: true,
  durationSeconds: true,
  startedAt: true,
  recordingSid: true,
  recordingUrl: true,
  transcriptStatus: true,
  aiAnalysisStatus: true,
  metadata: true,
  user: { select: { name: true, firstName: true, lastName: true } },
  contact: { select: { firstName: true, lastName: true } },
  opportunity: { select: { title: true } },
} satisfies Prisma.CallLogSelect;

const callLogOrderBy = [
  { startedAt: "desc" as const },
  { id: "desc" as const },
] satisfies Prisma.CallLogOrderByWithRelationInput[];

type CallLogRecord = Prisma.CallLogGetPayload<{
  select: typeof callLogSelect;
}>;

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function arrayMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return Array.isArray(value) ? value : [];
}

function interpretCallFailure(call: CallLogRecord) {
  const metadata = jsonObject(call.metadata);
  const attempts = arrayMetadata(metadata, "attempts");
  const hasAgentAttempts = attempts.length > 0;

  if (call.status === "FAILED") {
    if (call.direction === "OUTBOUND" && call.parentCallSid) {
      return {
        title: "Destination leg failed",
        detail:
          "The agent softphone started, but Twilio could not connect the outbound phone leg.",
        nextAction:
          "Try the number again. If it repeats for the same number, check carrier blocking or Twilio debugger.",
      };
    }

    return {
      title: "Call setup failed",
      detail: "Twilio reported the call as failed before it connected.",
      nextAction:
        "Retry once. If repeated, check the Twilio integration, number format and provider alerts.",
    };
  }

  if (call.status === "BUSY") {
    return {
      title: "Line busy",
      detail:
        call.direction === "OUTBOUND"
          ? "The destination returned busy or rejected the call while ringing."
          : "An agent or route returned busy while the caller was being connected.",
      nextAction: "Retry later or use another contact method.",
    };
  }

  if (call.status === "NO_ANSWER") {
    return {
      title: "No answer",
      detail:
        call.direction === "OUTBOUND"
          ? "The destination did not answer before the call timed out."
          : "No eligible agent answered before the inbound route timed out or moved to fallback.",
      nextAction:
        call.direction === "OUTBOUND"
          ? "Retry later or leave/send a follow-up message."
          : "Check agent availability, queue assignment and routing timeout.",
    };
  }

  if (call.status === "CANCELED") {
    if (call.direction === "INBOUND" && hasAgentAttempts) {
      return {
        title: "Caller abandoned",
        detail: "The caller hung up while agents were being invited or before anyone answered.",
        nextAction: "Review who was invited and call the customer back if appropriate.",
      };
    }

    return {
      title: "Cancelled before connection",
      detail: "The call was ended before both sides were connected.",
      nextAction: "Retry if this was unintentional; otherwise no action is needed.",
    };
  }

  return null;
}

function userIdFromClientIdentity(identity: string | null | undefined) {
  const normalized = identity?.replace(/^client:/, "") ?? "";

  if (!normalized.startsWith("agent_")) {
    return null;
  }

  return normalized.slice("agent_".length) || null;
}

function displayUserName(user: { name: string; firstName?: string | null; lastName?: string | null }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name;
}

function collectIdentityUserIds(calls: CallLogRecord[]) {
  return Array.from(
    new Set(
      calls
        .flatMap((call) => [
          userIdFromClientIdentity(call.fromIdentity),
          userIdFromClientIdentity(call.toIdentity),
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

async function loadIdentityUserNames(calls: CallLogRecord[]) {
  const userIds = collectIdentityUserIds(calls);

  if (!userIds.length) {
    return new Map<string, string>();
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
    },
  });

  return new Map(users.map((user) => [user.id, displayUserName(user)]));
}

function identityLabel(
  identity: string | null,
  identityUserNames: Map<string, string>,
) {
  const userId = userIdFromClientIdentity(identity);
  return userId ? identityUserNames.get(userId) ?? null : null;
}

export function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeMonitoringView(value: string | undefined): MonitoringView {
  return value === "logs" ? "logs" : "live";
}

export function normalizeCallDirectionFilter(value: string | undefined): CallDirectionFilter {
  const normalized = value?.toUpperCase();

  return callDirectionFilters.includes(normalized as CallDirectionFilter)
    ? (normalized as CallDirectionFilter)
    : "ALL";
}

export function normalizeCallStatusFilter(value: string | undefined): CallStatusFilter {
  const normalized = value?.toUpperCase();

  return callStatusFilters.includes(normalized as CallStatusFilter)
    ? (normalized as CallStatusFilter)
    : "ALL";
}

export function normalizeCallLogPage(value: string | undefined) {
  const page = Number.parseInt(value ?? "", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function normalizeCallLogPageSize(value: string | undefined) {
  const pageSize = Number.parseInt(value ?? "", 10);
  return callLogPageSizeOptions.includes(pageSize as (typeof callLogPageSizeOptions)[number])
    ? pageSize
    : defaultCallLogPageSize;
}

export function buildCallLogWhere({
  direction,
  query,
  status,
}: {
  direction: CallDirectionFilter;
  query: string;
  status: CallStatusFilter;
}): Prisma.CallLogWhereInput {
  const where: Prisma.CallLogWhereInput = {};

  if (direction !== "ALL") {
    where.direction = direction;
  }

  if (status === "COMPLETED") {
    where.status = "COMPLETED";
  } else if (status === "MISSED") {
    where.status = { in: ["NO_ANSWER", "BUSY", "FAILED", "CANCELED"] };
  } else if (status === "RECORDED") {
    where.recordingSid = { not: null };
  }

  if (query) {
    where.OR = [
      { fromNumber: { contains: query, mode: "insensitive" } },
      { toNumber: { contains: query, mode: "insensitive" } },
      { fromIdentity: { contains: query, mode: "insensitive" } },
      { toIdentity: { contains: query, mode: "insensitive" } },
      { callSid: { contains: query, mode: "insensitive" } },
      { contact: { firstName: { contains: query, mode: "insensitive" } } },
      { contact: { lastName: { contains: query, mode: "insensitive" } } },
      { user: { name: { contains: query, mode: "insensitive" } } },
      { opportunity: { title: { contains: query, mode: "insensitive" } } },
    ];
  }

  return where;
}

export function recordingPlaybackUrl(recordingSid: string | null, recordingUrl: string | null) {
  if (recordingUrl?.startsWith("/api/twilio/voice/recordings/")) return recordingUrl;

  const sid = recordingSid || recordingUrl?.match(/\/Recordings\/([^/.]+)/)?.[1] || null;
  return sid ? `/api/twilio/voice/recordings/${sid}` : null;
}

export function serializeCallLog(
  call: CallLogRecord,
  identityUserNames = new Map<string, string>(),
): CallLogEntry {
  const metadata = jsonObject(call.metadata);
  const fromLabel = identityLabel(call.fromIdentity, identityUserNames);
  const toLabel = identityLabel(call.toIdentity, identityUserNames);

  return {
    id: call.id,
    direction: call.direction,
    status: call.status,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    fromIdentity: call.fromIdentity,
    toIdentity: call.toIdentity,
    fromLabel,
    toLabel,
    durationSeconds: call.durationSeconds,
    startedAt: call.startedAt.toISOString(),
    recordingSid: call.recordingSid,
    recordingUrl: call.recordingUrl,
    playbackUrl: recordingPlaybackUrl(call.recordingSid, call.recordingUrl),
    transcriptStatus: call.transcriptStatus ?? stringMetadata(metadata, "transcriptStatus"),
    aiAnalysisStatus: call.aiAnalysisStatus ?? stringMetadata(metadata, "aiAnalysisStatus"),
    failureInsight: interpretCallFailure(call),
    summary: stringMetadata(metadata, "summary"),
    transcript: stringMetadata(metadata, "transcript"),
    contact: call.contact
      ? {
          firstName: call.contact.firstName,
          lastName: call.contact.lastName,
        }
      : null,
    opportunity: call.opportunity
      ? {
          title: call.opportunity.title,
        }
      : null,
    user: call.user
      ? {
          name: call.user.name,
        }
      : null,
  };
}

export async function loadCallLogPage({
  cursor,
  direction,
  page,
  pageSize,
  query,
  selectedCallId,
  status,
}: {
  cursor?: string | null;
  direction: CallDirectionFilter;
  page: number;
  pageSize: number;
  query: string;
  selectedCallId: string | null;
  status: CallStatusFilter;
}): Promise<CallLogPage> {
  const where = buildCallLogWhere({ direction, query, status });
  const totalCount = await prisma.callLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);
  const [calls, selectedCall] = await Promise.all([
    findCallLogRows({ cursor, normalizedPage, pageSize, where }),
    selectedCallId
      ? prisma.callLog.findUnique({
          where: { id: selectedCallId },
          select: callLogSelect,
        })
      : null,
  ]);
  const hasNextPage = calls.length > pageSize;
  const pageCalls = hasNextPage ? calls.slice(0, pageSize) : calls;
  const identityUserNames = await loadIdentityUserNames(
    selectedCall ? [...pageCalls, selectedCall] : pageCalls,
  );
  const serializedCalls = pageCalls.map((call) => serializeCallLog(call, identityUserNames));

  return {
    calls: serializedCalls,
    hasNextPage,
    hasPreviousPage: normalizedPage > 1,
    nextCursor: hasNextPage ? pageCalls[pageCalls.length - 1]?.id ?? null : null,
    selectedCall: selectedCall
      ? serializeCallLog(selectedCall, identityUserNames)
      : serializedCalls[0] ?? null,
    page: normalizedPage,
    pageSize,
    totalCount,
    totalPages,
  };
}

async function findCallLogRows({
  cursor,
  normalizedPage,
  pageSize,
  where,
}: {
  cursor: string | null | undefined;
  normalizedPage: number;
  pageSize: number;
  where: Prisma.CallLogWhereInput;
}) {
  const pageQuery = {
    where,
    orderBy: callLogOrderBy,
    take: pageSize + 1,
    select: callLogSelect,
  };

  if (!cursor) {
    return prisma.callLog.findMany({
      ...pageQuery,
      skip: (normalizedPage - 1) * pageSize,
    });
  }

  try {
    return await prisma.callLog.findMany({
      ...pageQuery,
      cursor: { id: cursor },
      skip: 1,
    });
  } catch (error) {
    if (prismaErrorCode(error) !== "P2025") {
      throw error;
    }

    return prisma.callLog.findMany({
      ...pageQuery,
      skip: (normalizedPage - 1) * pageSize,
    });
  }
}

function prismaErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : null;
}
