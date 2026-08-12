import { PrismaClient, type Prisma, type Task } from "@prisma/client";

const prisma = new PrismaClient();

const openStatuses = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;
const minimumConversationSeconds = 30;
const applyChanges = process.argv.includes("--apply");

type MissedCallTask = Pick<
  Task,
  | "id"
  | "title"
  | "description"
  | "status"
  | "dueDate"
  | "contactId"
  | "metadata"
  | "createdAt"
  | "updatedAt"
>;

function jsonObject(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...(metadata as Prisma.JsonObject) } as Record<
    string,
    Prisma.InputJsonValue
  >;
}

function stringMetadata(metadata: Prisma.JsonValue | null | undefined, key: string) {
  const value = jsonObject(metadata)[key];
  return typeof value === "string" ? value : null;
}

function normalizePhoneNumber(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return null;
  }

  return digits.startsWith("00") ? digits.slice(2) : digits;
}

function missedCallFromTitle(title: string) {
  return (
    title.match(/^Missed call from\s+(.+)$/i)?.[1]?.trim() ??
    title.match(/^Return missed call from\s+(.+)$/i)?.[1]?.trim() ??
    null
  );
}

function calledNumberFromDescription(description: string | null) {
  return description?.match(/Called number:\s*([^\s.]+)/i)?.[1]?.trim() ?? null;
}

function missedCallFromNumber(task: MissedCallTask) {
  return (
    stringMetadata(task.metadata, "missedCallFromNumber") ??
    missedCallFromTitle(task.title)
  );
}

function missedCallToNumber(task: MissedCallTask) {
  return (
    stringMetadata(task.metadata, "missedCallToNumber") ??
    calledNumberFromDescription(task.description)
  );
}

function titleFor(fromNumber: string | null) {
  return `Return missed call from ${fromNumber ?? "unknown number"}`;
}

function descriptionFor({
  fromNumber,
  toNumber,
  count,
}: {
  fromNumber: string | null;
  toNumber: string | null;
  count: number;
}) {
  return [
    `Latest missed call: ${fromNumber ?? "unknown number"}.`,
    count > 1 ? `Missed attempts from this number: ${count}.` : "",
    toNumber ? `Called number: ${toNumber}.` : "",
    "Return the call or mark the task complete once handled.",
  ]
    .filter(Boolean)
    .join("\n");
}

function numberMetadata(metadata: Prisma.JsonValue | null | undefined, key: string) {
  const value = jsonObject(metadata)[key];
  return typeof value === "number" ? value : null;
}

function taskReferenceDate(task: MissedCallTask) {
  return task.dueDate ?? task.updatedAt ?? task.createdAt;
}

function sortMostRecentFirst(a: MissedCallTask, b: MissedCallTask) {
  return taskReferenceDate(b).getTime() - taskReferenceDate(a).getTime();
}

function hasTranscript(metadata: Prisma.JsonValue | null | undefined) {
  const transcriptStatus = stringMetadata(metadata, "transcriptStatus");
  return transcriptStatus === "COMPLETED" || transcriptStatus === "READY";
}

async function hasSuccessfulCallAfter({
  normalizedNumber,
  after,
}: {
  normalizedNumber: string;
  after: Date;
}) {
  const calls = await prisma.callLog.findMany({
    where: {
      status: "COMPLETED",
      startedAt: { gte: after },
      OR: [{ fromNumber: { not: null } }, { toNumber: { not: null } }],
    },
    select: {
      callSid: true,
      fromNumber: true,
      toNumber: true,
      durationSeconds: true,
      metadata: true,
      startedAt: true,
    },
    orderBy: { startedAt: "desc" },
    take: 500,
  });

  return (
    calls.find((call) => {
      const matchesNumber =
        normalizePhoneNumber(call.fromNumber) === normalizedNumber ||
        normalizePhoneNumber(call.toNumber) === normalizedNumber;
      const hasConversation =
        hasTranscript(call.metadata) ||
        (typeof call.durationSeconds === "number" &&
          call.durationSeconds >= minimumConversationSeconds);

      return matchesNumber && hasConversation;
    }) ?? null
  );
}

async function main() {
  const tasks = await prisma.task.findMany({
    where: {
      status: { in: [...openStatuses] },
      OR: [
        { title: { startsWith: "Missed call from" } },
        { title: { startsWith: "Return missed call from" } },
        {
          metadata: {
            path: ["type"],
            equals: "MISSED_CALL",
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      dueDate: true,
      contactId: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const groups = new Map<string, MissedCallTask[]>();

  for (const task of tasks) {
    const normalized = normalizePhoneNumber(missedCallFromNumber(task));

    if (!normalized) {
      continue;
    }

    groups.set(normalized, [...(groups.get(normalized) ?? []), task]);
  }

  let rewritten = 0;
  let deduplicated = 0;
  let resolved = 0;
  const now = new Date().toISOString();

  for (const [normalizedNumber, group] of groups) {
    const ordered = [...group].sort(sortMostRecentFirst);
    const [primary, ...duplicates] = ordered;
    const fromNumber = missedCallFromNumber(primary);
    const toNumber = missedCallToNumber(primary);
    const latestReferenceDate = taskReferenceDate(primary);
    const successfulCall = await hasSuccessfulCallAfter({
      normalizedNumber,
      after: latestReferenceDate,
    });

    if (successfulCall) {
      resolved += ordered.length;

      if (applyChanges) {
        await prisma.$transaction(
          ordered.map((task) =>
            prisma.task.update({
              where: { id: task.id },
              data: {
                status: "DONE",
                metadata: {
                  ...jsonObject(task.metadata),
                  resolvedAt: now,
                  resolution: "successful-call-maintenance-cleanup",
                  resolvedByCallSid: successfulCall.callSid ?? null,
                },
              },
            }),
          ),
        );
      }

      continue;
    }

    const primaryMetadata = jsonObject(primary.metadata);
    const missedCallCount = Math.max(
      numberMetadata(primary.metadata, "missedCallCount") ?? 0,
      ordered.length,
    );
    const nextTitle = titleFor(fromNumber);
    const nextDescription = descriptionFor({
      fromNumber,
      toNumber,
      count: missedCallCount,
    });
    const primaryNeedsRewrite =
      primary.title !== nextTitle ||
      primary.description !== nextDescription ||
      stringMetadata(primary.metadata, "missedCallFromNormalized") !==
        normalizedNumber ||
      stringMetadata(primary.metadata, "missedCallFromNumber") !== fromNumber ||
      stringMetadata(primary.metadata, "missedCallToNumber") !== toNumber ||
      numberMetadata(primary.metadata, "missedCallCount") !== missedCallCount;

    if (primaryNeedsRewrite) {
      rewritten += 1;
    }

    deduplicated += duplicates.length;

    if (!applyChanges) {
      continue;
    }

    if (!primaryNeedsRewrite && !duplicates.length) {
      continue;
    }

    await prisma.$transaction([
      ...(primaryNeedsRewrite
        ? [
            prisma.task.update({
              where: { id: primary.id },
              data: {
                title: nextTitle,
                description: nextDescription,
                metadata: {
                  ...primaryMetadata,
                  type: "MISSED_CALL",
                  sourceCallSid:
                    stringMetadata(primary.metadata, "sourceCallSid") ??
                    stringMetadata(primary.metadata, "latestMissedCallSid"),
                  latestMissedCallSid:
                    stringMetadata(primary.metadata, "latestMissedCallSid") ??
                    stringMetadata(primary.metadata, "sourceCallSid"),
                  missedCallFromNumber: fromNumber,
                  missedCallFromNormalized: normalizedNumber,
                  missedCallToNumber: toNumber,
                  missedCallCount,
                  lastMissedAt: latestReferenceDate.toISOString(),
                  migratedAt: now,
                },
              },
            }),
          ]
        : []),
      ...duplicates.map((task) =>
        prisma.task.update({
          where: { id: task.id },
          data: {
            status: "DONE",
            metadata: {
              ...jsonObject(task.metadata),
              resolvedAt: now,
              resolution: "deduplicated-missed-call-maintenance-cleanup",
              mergedIntoTaskId: primary.id,
            },
          },
        }),
      ),
    ]);
  }

  console.log(
    JSON.stringify(
      {
        mode: applyChanges ? "apply" : "dry-run",
        openMissedCallTasksFound: tasks.length,
        callerGroups: groups.size,
        primaryTasksRewritten: rewritten,
        duplicateTasksCompleted: deduplicated,
        tasksCompletedBecauseCallSucceeded: resolved,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
