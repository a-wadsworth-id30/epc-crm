import "server-only";

import twilio from "twilio";
import type { Prisma, User } from "@prisma/client";
import { normalizeCallableNumber } from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";
import { runSalesAutomationTrigger } from "@/lib/sales/automation";
import { markOpportunityFirstContacted } from "@/lib/sales/lifecycle";

export const queueRetrySeconds = 12;
export const queueMaxAttempts = 5;
export const browserAvailabilityTtlMs = 10 * 60 * 1000;
export const liveQueueWindowMs = 30 * 60 * 1000;
export const liveQueueStatuses = ["WAITING", "CONNECTING", "ANSWERED"] as const;
export const liveCallStatuses = ["QUEUED", "RINGING", "IN_PROGRESS"] as const;

export function liveCallWhere(now = new Date()): Prisma.CallLogWhereInput {
  return {
    status: { in: [...liveCallStatuses] },
    startedAt: { gte: new Date(now.getTime() - liveQueueWindowMs) },
    endedAt: null,
  };
}

export function liveQueueWhere(
  now = new Date(),
): Prisma.CallQueueEntryWhereInput {
  return {
    status: { in: [...liveQueueStatuses] },
    queuedAt: { gte: new Date(now.getTime() - liveQueueWindowMs) },
    completedAt: null,
    missedAt: null,
  };
}

export function twimlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

export function webhookOrigin(request: Request, configuredBaseUrl: string) {
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  return new URL(request.url).origin;
}

export function voiceIdentity(userId: string) {
  return `agent_${userId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export function userIdFromClientIdentity(identity: string) {
  const normalized = identity.replace(/^client:/, "");

  if (!normalized.startsWith("agent_")) {
    return null;
  }

  return normalized.slice("agent_".length) || null;
}

export function conferenceNameFromCallSid(callSid: string) {
  return `crm-${callSid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function displayUserName(
  user: Pick<User, "name" | "firstName" | "lastName">,
) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name;
}

export function targetForUser(user: {
  id: string;
  mobile: string | null;
  landline: string | null;
  sipAddress: string | null;
  voiceExtension: string | null;
  voiceRoutingMode: string;
}) {
  if (
    (user.voiceRoutingMode === "BROWSER" || user.voiceRoutingMode === "FLEX") &&
    user.voiceExtension
  ) {
    return `client:${voiceIdentity(user.id)}`;
  }

  if (user.voiceRoutingMode === "SIP" && user.sipAddress) {
    return user.sipAddress.startsWith("sip:")
      ? user.sipAddress
      : `sip:${user.sipAddress}`;
  }

  if (user.voiceRoutingMode === "LANDLINE" && user.landline) {
    return normalizeCallableNumber(user.landline);
  }

  return normalizeCallableNumber(user.mobile ?? user.landline ?? "");
}

export async function findAvailableAgent(excludeUserId?: string | null) {
  const browserSeenAfter = new Date(Date.now() - browserAvailabilityTtlMs);
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      voiceAvailability: "AVAILABLE",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      OR: [
        { voiceRoutingMode: { notIn: ["BROWSER", "FLEX"] } },
        { voiceLastSeenAt: { gte: browserSeenAfter } },
      ],
    },
    orderBy: [
      { voiceLastSeenAt: "desc" },
      { firstName: "asc" },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      mobile: true,
      landline: true,
      sipAddress: true,
      voiceExtension: true,
      voiceRoutingMode: true,
    },
  });

  return users.find((user) => Boolean(targetForUser(user))) ?? null;
}

export async function findContactContext(phoneNumber: string) {
  const normalized = normalizeCallableNumber(phoneNumber);

  if (!normalized) {
    return { contact: null, opportunity: null };
  }

  const contact = await prisma.contact.findFirst({
    where: {
      OR: [
        { phoneNormalized: normalized },
        { additionalPhones: { some: { phoneNormalized: normalized } } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  if (!contact) {
    return { contact: null, opportunity: null };
  }

  const opportunities = await prisma.salesOpportunity.findMany({
    where: {
      contactId: contact.id,
      stage: { notIn: ["WON", "LOST"] },
    },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: {
      id: true,
      contactId: true,
      ownerId: true,
      salesPipelineStageId: true,
      source: true,
    },
  });

  return {
    contact,
    opportunity: opportunities.length === 1 ? opportunities[0] : null,
  };
}

export async function createPhoneCommunication(data: {
  opportunityId: string | null | undefined;
  contactId?: string | null;
  userId?: string | null;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  subject: string;
  summary: string;
  body?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  externalId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  if (!data.opportunityId) {
    return null;
  }

  try {
    const communication = await prisma.salesCommunication.create({
      data: {
        opportunityId: data.opportunityId,
        contactId: data.contactId,
        userId: data.userId,
        channel: "PHONE",
        direction: data.direction,
        subject: data.subject,
        summary: data.summary,
        body: data.body,
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        externalId: data.externalId,
        metadata: data.metadata,
      },
    });

    if (data.direction === "OUTBOUND") {
      await markOpportunityFirstContacted(prisma, {
        opportunityId: data.opportunityId,
        occurredAt: communication.occurredAt,
        userId: data.userId,
        channel: "PHONE",
        communicationId: communication.id,
        source: "phone-communication",
      });
    }

    await runSalesAutomationTrigger(prisma, {
      communicationId: communication.id,
      opportunityId: data.opportunityId,
      trigger: "CALL_COMPLETED",
      userId: data.userId,
      metadata: {
        direction: data.direction,
        source: "phone-communication",
      },
    });

    await bumpRealtimeTopics([
      realtimeTopics.saleConversation(data.opportunityId),
      data.contactId ? realtimeTopics.contactConversation(data.contactId) : null,
    ]);

    return communication;
  } catch (error) {
    console.error("Phone sales communication logging failed", error);
    return null;
  }
}

const openMissedCallTaskStatuses = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;
const missedCallFollowUpMs = 30 * 60 * 1000;
const successfulFollowUpMinimumDurationSeconds = 30;

function normalizeTaskPhoneNumber(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return null;
  }

  return digits.startsWith("00") ? digits.slice(2) : digits;
}

function taskJsonObject(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...(metadata as Prisma.JsonObject) } as Record<
    string,
    Prisma.InputJsonValue
  >;
}

function missedCallTaskTitle(fromNumber: string | null) {
  return `Return missed call from ${fromNumber ?? "unknown number"}`;
}

function missedCallTaskDescription({
  fromNumber,
  toNumber,
  missedCallCount,
}: {
  fromNumber: string | null;
  toNumber: string | null;
  missedCallCount: number;
}) {
  return [
    `Latest missed call: ${fromNumber ?? "unknown number"}.`,
    missedCallCount > 1 ? `Missed attempts from this number: ${missedCallCount}.` : "",
    toNumber ? `Called number: ${toNumber}.` : "",
    "Return the call or mark the task complete once handled.",
  ]
    .filter(Boolean)
    .join("\n");
}

function missedCallTaskNumberFilters(
  fromNumber: string | null,
): Prisma.TaskWhereInput[] {
  const normalized = normalizeTaskPhoneNumber(fromNumber);
  const filters: Prisma.TaskWhereInput[] = [];

  if (normalized) {
    filters.push({
      metadata: {
        path: ["missedCallFromNormalized"],
        equals: normalized,
      },
    });
  }

  if (fromNumber) {
    filters.push({
      title: {
        in: [`Missed call from ${fromNumber}`, missedCallTaskTitle(fromNumber)],
      },
    });
  }

  return filters;
}

export async function createMissedCallTask(data: {
  callSid: string;
  fromNumber: string | null;
  toNumber: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  assignedUserId?: string | null;
}) {
  const existing = await prisma.task.findFirst({
    where: {
      metadata: {
        path: ["sourceCallSid"],
        equals: data.callSid,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  const openTaskFilters = missedCallTaskNumberFilters(data.fromNumber);
  const existingOpenTasks = openTaskFilters.length
    ? await prisma.task.findMany({
        where: {
          status: { in: [...openMissedCallTaskStatuses] },
          OR: openTaskFilters,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true, metadata: true },
      })
    : [];

  if (existingOpenTasks.length) {
    const [primaryTask, ...duplicateTasks] = existingOpenTasks;
    const primaryMetadata = taskJsonObject(primaryTask.metadata);
    const missedCallCount =
      typeof primaryMetadata.missedCallCount === "number"
        ? primaryMetadata.missedCallCount + 1
        : existingOpenTasks.length + 1;
    const normalizedFrom = normalizeTaskPhoneNumber(data.fromNumber);
    const lastMissedAt = new Date().toISOString();
    const updated = await prisma.$transaction([
      prisma.task.update({
        where: { id: primaryTask.id },
        data: {
          title: missedCallTaskTitle(data.fromNumber),
          description: missedCallTaskDescription({
            fromNumber: data.fromNumber,
            toNumber: data.toNumber,
            missedCallCount,
          }),
          dueDate: new Date(Date.now() + missedCallFollowUpMs),
          ...(data.assignedUserId ? { assigneeId: data.assignedUserId } : {}),
          ...(data.contactId ? { contactId: data.contactId } : {}),
          metadata: {
            ...primaryMetadata,
            type: "MISSED_CALL",
            sourceCallSid: data.callSid,
            latestMissedCallSid: data.callSid,
            missedCallFromNumber: data.fromNumber,
            missedCallFromNormalized: normalizedFrom,
            missedCallToNumber: data.toNumber,
            missedCallCount,
            lastMissedAt,
            opportunityId: data.opportunityId ?? primaryMetadata.opportunityId ?? null,
          },
        },
        select: { id: true },
      }),
      ...duplicateTasks.map((task) =>
        prisma.task.update({
          where: { id: task.id },
          data: {
            status: "DONE",
            metadata: {
              ...taskJsonObject(task.metadata),
              resolvedAt: lastMissedAt,
              resolution: "deduplicated-missed-call-task",
              mergedIntoTaskId: primaryTask.id,
            },
          },
          select: { id: true },
        }),
      ),
    ]);

    return updated[0];
  }

  const creator = await prisma.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!creator) {
    return null;
  }

  return prisma.task.create({
    data: {
      title: missedCallTaskTitle(data.fromNumber),
      description: missedCallTaskDescription({
        fromNumber: data.fromNumber,
        toNumber: data.toNumber,
        missedCallCount: 1,
      }),
      status: "TODO",
      dueDate: new Date(Date.now() + missedCallFollowUpMs),
      creatorId: creator.id,
      assigneeId: data.assignedUserId ?? creator.id,
      contactId: data.contactId ?? null,
      metadata: {
        type: "MISSED_CALL",
        sourceCallSid: data.callSid,
        latestMissedCallSid: data.callSid,
        missedCallFromNumber: data.fromNumber,
        missedCallFromNormalized: normalizeTaskPhoneNumber(data.fromNumber),
        missedCallToNumber: data.toNumber,
        missedCallCount: 1,
        lastMissedAt: new Date().toISOString(),
        opportunityId: data.opportunityId ?? null,
      },
    },
    select: { id: true },
  });
}

export async function resolveMissedCallTasksForSuccessfulCall(data: {
  callSid?: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  durationSeconds?: number | null;
  hasTranscript?: boolean;
}) {
  const hasConversation =
    data.hasTranscript ||
    (typeof data.durationSeconds === "number" &&
      data.durationSeconds >= successfulFollowUpMinimumDurationSeconds);

  if (!hasConversation) {
    return 0;
  }

  const filters = [data.fromNumber, data.toNumber].flatMap((number) =>
    missedCallTaskNumberFilters(number),
  );

  if (!filters.length) {
    return 0;
  }

  const tasks = await prisma.task.findMany({
    where: {
      status: { in: [...openMissedCallTaskStatuses] },
      OR: filters,
    },
    select: { id: true, metadata: true },
  });

  if (!tasks.length) {
    return 0;
  }

  const resolvedAt = new Date().toISOString();

  await prisma.$transaction(
    tasks.map((task) =>
      prisma.task.update({
        where: { id: task.id },
        data: {
          status: "DONE",
          metadata: {
            ...taskJsonObject(task.metadata),
            resolvedAt,
            resolution: data.hasTranscript
              ? "successful-call-transcript"
              : "successful-call-duration",
            resolvedByCallSid: data.callSid ?? null,
          },
        },
      }),
    ),
  );

  return tasks.length;
}

export function buildConferenceTwiML(options: {
  conferenceName: string;
  statusUrl: string;
  recordingStatusUrl?: string;
  participantLabel?: string;
  waitUrl?: string;
}) {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial();
  const conferenceOptions: Prisma.JsonObject &
    Record<string, string | boolean | string[]> = {
    startConferenceOnEnter: true,
    endConferenceOnExit: false,
    statusCallback: options.statusUrl,
    statusCallbackEvent: ["start", "end", "join", "leave"],
  };

  if (options.recordingStatusUrl) {
    conferenceOptions.record = "record-from-start";
    conferenceOptions.recordingStatusCallback = options.recordingStatusUrl;
    conferenceOptions.recordingStatusCallbackEvent = ["completed"];
  }

  if (options.waitUrl) {
    conferenceOptions.waitUrl = options.waitUrl;
  }

  if (options.participantLabel) {
    conferenceOptions.participantLabel = options.participantLabel;
  }

  dial.conference(conferenceOptions, options.conferenceName);

  return response.toString();
}
