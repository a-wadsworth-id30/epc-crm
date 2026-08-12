import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordingPlaybackUrl } from "@/lib/telephony/call-log";
import {
  defaultRecordingPageSize,
  recordingPageSizeOptions,
  type RecordingEntry,
  type RecordingFilter,
  type RecordingPage,
  type RecordingPageSummary,
} from "@/lib/telephony/recordings-shared";

export function normalizeRecordingFilter(value: string | null | undefined): RecordingFilter {
  if (value === "INBOUND" || value === "OUTBOUND" || value === "READY" || value === "NEEDS_TRANSCRIPT") {
    return value;
  }

  return "ALL";
}

export function normalizeRecordingPage(value: string | null | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export function normalizeRecordingPageSize(value: string | null | undefined) {
  const parsed = Number(value);

  return recordingPageSizeOptions.includes(parsed as (typeof recordingPageSizeOptions)[number])
    ? parsed
    : defaultRecordingPageSize;
}

function recordMetadata(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function appendAnd(where: Prisma.CallLogWhereInput, clause: Prisma.CallLogWhereInput) {
  const existing = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  where.AND = [...existing, clause];
}

function hasRecordingWhere(): Prisma.CallLogWhereInput {
  return {
    OR: [{ recordingSid: { not: null } }, { recordingUrl: { not: null } }],
  };
}

function andWhere(
  where: Prisma.CallLogWhereInput,
  clause: Prisma.CallLogWhereInput,
): Prisma.CallLogWhereInput {
  return { AND: [where, clause] };
}

const recordingOrderBy = [
  { startedAt: "desc" as const },
  { id: "desc" as const },
] satisfies Prisma.CallLogOrderByWithRelationInput[];

const readyStatuses = ["COMPLETED", "READY"] as const;

export function buildRecordingWhere({
  filter,
  query,
}: {
  filter: RecordingFilter;
  query: string;
}) {
  const where: Prisma.CallLogWhereInput = {};

  if (filter === "INBOUND" || filter === "OUTBOUND") {
    where.direction = filter;
  }

  if (filter === "READY") {
    appendAnd(where, hasRecordingWhere());
  }

  if (filter === "NEEDS_TRANSCRIPT") {
    appendAnd(where, hasRecordingWhere());
    appendAnd(where, {
      OR: [
        { transcriptStatus: null },
        { transcriptStatus: { notIn: [...readyStatuses] } },
      ],
    });
  }

  if (query) {
    const contains = { contains: query, mode: "insensitive" as const };
    appendAnd(where, {
      OR: [
        { fromNumber: contains },
        { toNumber: contains },
        { fromIdentity: contains },
        { toIdentity: contains },
        { callSid: contains },
        { recordingSid: contains },
        { user: { is: { name: contains } } },
        { contact: { is: { firstName: contains } } },
        { contact: { is: { lastName: contains } } },
        { opportunity: { is: { title: contains } } },
      ],
    });
  }

  return where;
}

export function serializeRecording(call: {
  id: string;
  direction: string;
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  fromIdentity: string | null;
  toIdentity: string | null;
  callSid: string | null;
  recordingSid: string | null;
  recordingUrl: string | null;
  recordingConsent: string;
  durationSeconds: number | null;
  startedAt: Date | null;
  transcriptStatus: string | null;
  aiAnalysisStatus: string | null;
  metadata: Prisma.JsonValue | null;
  user: { name: string } | null;
  contact: { firstName: string | null; lastName: string | null } | null;
  opportunity: { title: string } | null;
}): RecordingEntry {
  const metadata = recordMetadata(call.metadata);

  return {
    id: call.id,
    direction: call.direction,
    status: call.status,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    fromIdentity: call.fromIdentity,
    toIdentity: call.toIdentity,
    callSid: call.callSid,
    recordingSid: call.recordingSid,
    recordingUrl: call.recordingUrl,
    recordingConsent: call.recordingConsent,
    durationSeconds: call.durationSeconds,
    startedAt: call.startedAt?.toISOString() ?? null,
    playbackUrl: recordingPlaybackUrl(call.recordingSid, call.recordingUrl),
    transcriptStatus: call.transcriptStatus ?? stringMetadata(metadata, "transcriptStatus"),
    aiAnalysisStatus: call.aiAnalysisStatus ?? stringMetadata(metadata, "aiAnalysisStatus"),
    summary: stringMetadata(metadata, "summary"),
    transcript: stringMetadata(metadata, "transcript"),
    transcriptError: stringMetadata(metadata, "transcriptError"),
    user: call.user,
    contact: call.contact,
    opportunity: call.opportunity,
  };
}

export async function loadRecordingPage({
  cursor,
  filter,
  page,
  pageSize,
  query,
}: {
  cursor?: string | null;
  filter: RecordingFilter;
  page: number;
  pageSize: number;
  query: string;
}): Promise<RecordingPage> {
  const where = buildRecordingWhere({ filter, query });
  const callSelect = {
    id: true,
    direction: true,
    status: true,
    fromNumber: true,
    toNumber: true,
    fromIdentity: true,
    toIdentity: true,
    callSid: true,
    recordingSid: true,
    recordingUrl: true,
    recordingConsent: true,
    transcriptStatus: true,
    aiAnalysisStatus: true,
    durationSeconds: true,
    startedAt: true,
    metadata: true,
    user: { select: { name: true } },
    contact: { select: { firstName: true, lastName: true } },
    opportunity: { select: { title: true } },
  } satisfies Prisma.CallLogSelect;

  const [totalCount, summary] = await Promise.all([
    prisma.callLog.count({ where }),
    loadRecordingSummary(where),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const calls = await findRecordingRows({
    callSelect,
    cursor,
    pageSize,
    safePage,
    where,
  });
  const hasNextPage = calls.length > pageSize;
  const pageCalls = hasNextPage ? calls.slice(0, pageSize) : calls;

  return {
    calls: pageCalls.map(serializeRecording),
    hasNextPage,
    hasPreviousPage: safePage > 1,
    nextCursor: hasNextPage ? pageCalls[pageCalls.length - 1]?.id ?? null : null,
    page: safePage,
    pageSize,
    summary,
    totalCount,
    totalPages,
  };
}

async function loadRecordingSummary(
  where: Prisma.CallLogWhereInput,
): Promise<RecordingPageSummary> {
  const [
    recordingCount,
    transcriptReadyCount,
    aiReadyCount,
    durationAggregate,
  ] = await Promise.all([
    prisma.callLog.count({ where: andWhere(where, hasRecordingWhere()) }),
    prisma.callLog.count({
      where: andWhere(where, { transcriptStatus: { in: [...readyStatuses] } }),
    }),
    prisma.callLog.count({
      where: andWhere(where, { aiAnalysisStatus: { in: [...readyStatuses] } }),
    }),
    prisma.callLog.aggregate({
      where,
      _avg: { durationSeconds: true },
    }),
  ]);

  return {
    aiReadyCount,
    averageDurationSeconds: Math.round(durationAggregate._avg.durationSeconds ?? 0),
    recordingCount,
    transcriptReadyCount,
  };
}

async function findRecordingRows({
  callSelect,
  cursor,
  pageSize,
  safePage,
  where,
}: {
  callSelect: Prisma.CallLogSelect;
  cursor: string | null | undefined;
  pageSize: number;
  safePage: number;
  where: Prisma.CallLogWhereInput;
}) {
  const pageQuery = {
    where,
    orderBy: recordingOrderBy,
    take: pageSize + 1,
    select: callSelect,
  };

  if (!cursor) {
    return prisma.callLog.findMany({
      ...pageQuery,
      skip: (safePage - 1) * pageSize,
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
      skip: (safePage - 1) * pageSize,
    });
  }
}

function prismaErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : null;
}
