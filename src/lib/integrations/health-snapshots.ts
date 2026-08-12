import "server-only";

import {
  IntegrationHealthSnapshotStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type IntegrationHealthCheckSnapshot = {
  detail: string;
  label: string;
  metadata?: Prisma.InputJsonValue;
  ready: boolean;
};

export type LatestIntegrationHealthSnapshot = {
  capability: string;
  checkedAt: string;
  message: string | null;
  provider: string;
  source: string;
  status: `${IntegrationHealthSnapshotStatus}`;
};

function capabilityKey(label: string) {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "general"
  );
}

function healthStatusForReady(ready: boolean) {
  return ready
    ? IntegrationHealthSnapshotStatus.READY
    : IntegrationHealthSnapshotStatus.WARNING;
}

export async function recordIntegrationHealthSnapshot({
  capability = "setup",
  checkedAt = new Date(),
  integrationId,
  message,
  metadata,
  provider,
  source,
  status,
}: {
  capability?: string;
  checkedAt?: Date;
  integrationId?: string | null;
  message?: string | null;
  metadata?: Prisma.InputJsonValue;
  provider: string;
  source: string;
  status: IntegrationHealthSnapshotStatus;
}) {
  try {
    await prisma.integrationHealthSnapshot.create({
      data: {
        capability,
        checkedAt,
        integrationId: integrationId || undefined,
        message,
        metadata,
        provider,
        source,
        status,
      },
    });
  } catch (error) {
    console.error("Unable to record integration health snapshot", error);
  }
}

export async function recordIntegrationHealthChecks({
  checkedAt = new Date(),
  checks,
  integrationId,
  provider,
  source,
}: {
  checkedAt?: Date;
  checks: IntegrationHealthCheckSnapshot[];
  integrationId?: string | null;
  provider: string;
  source: string;
}) {
  if (!checks.length) return;

  try {
    await prisma.integrationHealthSnapshot.createMany({
      data: checks.map((check) => ({
        capability: capabilityKey(check.label),
        checkedAt,
        integrationId: integrationId || undefined,
        message: check.detail,
        metadata:
          check.metadata ??
          ({
            label: check.label,
          } satisfies Prisma.InputJsonObject),
        provider,
        source,
        status: healthStatusForReady(check.ready),
      })),
    });
  } catch (error) {
    console.error("Unable to record integration health checks", error);
  }
}

export async function recordIntegrationSetupHealth({
  connected,
  integrationId,
  message,
  metadata,
  provider,
  source = "settings-save",
}: {
  connected: boolean;
  integrationId?: string | null;
  message: string;
  metadata?: Prisma.InputJsonValue;
  provider: string;
  source?: string;
}) {
  await recordIntegrationHealthSnapshot({
    capability: "setup",
    integrationId,
    message,
    metadata,
    provider,
    source,
    status: healthStatusForReady(connected),
  });
}

export async function latestIntegrationHealthSnapshotsByProvider(
  providers: string[],
) {
  if (!providers.length) return new Map<string, LatestIntegrationHealthSnapshot>();

  try {
    const snapshots = await prisma.integrationHealthSnapshot.findMany({
      where: {
        provider: {
          in: providers,
        },
      },
      orderBy: {
        checkedAt: "desc",
      },
      select: {
        capability: true,
        checkedAt: true,
        message: true,
        provider: true,
        source: true,
        status: true,
      },
      take: Math.max(providers.length * 6, 30),
    });
    const latestByProvider = new Map<string, LatestIntegrationHealthSnapshot>();

    for (const snapshot of snapshots) {
      if (latestByProvider.has(snapshot.provider)) continue;

      latestByProvider.set(snapshot.provider, {
        ...snapshot,
        checkedAt: snapshot.checkedAt.toISOString(),
      });
    }

    return latestByProvider;
  } catch (error) {
    console.error("Unable to load integration health snapshots", error);
    return new Map<string, LatestIntegrationHealthSnapshot>();
  }
}
