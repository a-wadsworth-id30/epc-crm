import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export { realtimeTopics } from "@/lib/realtime/topic-names";

type RealtimeClient = Pick<PrismaClient, "realtimeVersion">;

function uniqueTopics(topics: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      topics
        .map((topic) => topic?.trim())
        .filter((topic): topic is string => Boolean(topic)),
    ),
  );
}

export async function bumpRealtimeTopics(
  topics: Array<string | null | undefined>,
  client: RealtimeClient = prisma,
) {
  const normalizedTopics = uniqueTopics(topics);
  if (!normalizedTopics.length) return;

  try {
    await Promise.all(
      normalizedTopics.map((topic) =>
        client.realtimeVersion.upsert({
          where: { topic },
          create: { topic },
          update: { version: { increment: 1 } },
        }),
      ),
    );
  } catch (error) {
    console.error("Realtime topic bump failed", {
      error,
      topics: normalizedTopics,
    });
  }
}
