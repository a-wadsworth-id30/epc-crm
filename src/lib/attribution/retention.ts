import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";

type PurgeExpiredAttributionDataOptions = {
  actorId?: string | null;
  trigger?: string;
};

export async function purgeExpiredAttributionData(
  options: PurgeExpiredAttributionDataOptions = {},
) {
  const settings = await getCrmSettings();
  const retentionDays = settings.attributionRetentionDays;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const assignments = await tx.attributionNumberAssignment.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    const records = await tx.attributionRecord.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const debugEvents = await tx.attributionDebugEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const snapshots = await tx.attributionSnapshot.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
    const result = {
      retentionDays,
      cutoff,
      assignments: assignments.count,
      records: records.count,
      debugEvents: debugEvents.count,
      snapshots: snapshots.count,
    };

    await tx.auditLog.create({
      data: {
        action: "attribution.privacy.retention_purged",
        actorId: options.actorId ?? null,
        entity: "AttributionRetention",
        entityId: cutoff.toISOString(),
        metadata: {
          cutoff: cutoff.toISOString(),
          retentionDays,
          deleted: {
            snapshots: result.snapshots,
            records: result.records,
            numberAssignments: result.assignments,
            debugEvents: result.debugEvents,
          },
          trigger: options.trigger ?? "manual",
        },
      },
    });

    return result;
  });
}
