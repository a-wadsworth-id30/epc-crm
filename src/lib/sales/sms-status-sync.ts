import "server-only";

import type { Prisma } from "@prisma/client";
import twilio from "twilio";
import {
  getStoredTwilioConfig,
  getTwilioMessagingRuntime,
} from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";

type SmsStatusCommunication = {
  id: string;
  channel: string;
  direction: string;
  externalId: string | null;
  metadata: Prisma.JsonValue | null;
  updatedAt: Date;
};

const finalStatuses = new Set(["delivered", "failed", "undelivered", "read"]);
const syncableStatuses = new Set([
  "accepted",
  "queued",
  "scheduled",
  "sending",
  "sent",
]);

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isStale(updatedAt: Date, now: Date) {
  return now.getTime() - updatedAt.getTime() > 30_000;
}

function mergeMetadata(
  metadata: Prisma.JsonValue | null,
  patch: Record<string, Prisma.JsonValue | null | undefined>,
): Prisma.JsonObject {
  const base = jsonObject(metadata) as Record<string, Prisma.JsonValue>;

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      base[key] = value;
    }
  }

  return base as Prisma.JsonObject;
}

function shouldSyncStatus(communication: SmsStatusCommunication, now: Date) {
  if (
    communication.channel !== "SMS" ||
    communication.direction !== "OUTBOUND" ||
    !communication.externalId?.startsWith("SM")
  ) {
    return false;
  }

  const metadata = jsonObject(communication.metadata);
  const provider = stringValue(metadata.provider);
  const status = stringValue(metadata.status)?.toLowerCase();

  if (provider && provider !== "twilio") return false;
  if (status && finalStatuses.has(status)) return false;
  if (status && !syncableStatuses.has(status)) return false;

  return isStale(communication.updatedAt, now);
}

export async function syncStaleOutboundSmsStatuses<
  T extends SmsStatusCommunication,
>(communications: T[]) {
  const now = new Date();
  const candidates = communications.filter((communication) =>
    shouldSyncStatus(communication, now),
  );

  if (!candidates.length) return communications;

  let runtime: ReturnType<typeof getTwilioMessagingRuntime>;
  try {
    runtime = getTwilioMessagingRuntime(await getStoredTwilioConfig());
  } catch {
    return communications;
  }

  const client = twilio(runtime.accountSid, runtime.authToken);
  const updatedMetadataById = new Map<string, Prisma.JsonObject>();

  await Promise.allSettled(
    candidates.map(async (communication) => {
      const message = await client.messages(communication.externalId!).fetch();
      const metadata = mergeMetadata(communication.metadata, {
        status: message.status,
        errorCode: message.errorCode ? String(message.errorCode) : null,
        errorMessage: message.errorMessage || null,
        dateSent: message.dateSent?.toISOString() ?? null,
        twilioUpdatedAt: message.dateUpdated?.toISOString() ?? null,
        statusSyncedAt: new Date().toISOString(),
      });

      await prisma.salesCommunication.update({
        where: { id: communication.id },
        data: { metadata },
      });

      updatedMetadataById.set(communication.id, metadata);
    }),
  );

  if (!updatedMetadataById.size) return communications;

  return communications.map((communication) => {
    const metadata = updatedMetadataById.get(communication.id);

    return metadata ? { ...communication, metadata } : communication;
  });
}
