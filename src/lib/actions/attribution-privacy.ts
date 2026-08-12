"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { purgeExpiredAttributionData } from "@/lib/attribution/retention";
import { prisma } from "@/lib/prisma";

export type AttributionPrivacyActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const identitySchema = z.object({
  identityType: z.enum(["visitorId", "sessionId"]),
  identityValue: z.string().trim().min(3, "Enter a visitor or session ID."),
});

function identityWhere(identityType: "visitorId" | "sessionId", identityValue: string) {
  return identityType === "visitorId"
    ? { visitorId: identityValue }
    : { sessionId: identityValue };
}

export async function deleteAttributionIdentityAction(
  _: AttributionPrivacyActionState,
  formData: FormData,
): Promise<AttributionPrivacyActionState> {
  const admin = await requireAdmin();

  const parsed = identitySchema.safeParse({
    identityType: formData.get("identityType"),
    identityValue: formData.get("identityValue"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the identity value.",
      savedAt: null,
    };
  }

  const where = identityWhere(parsed.data.identityType, parsed.data.identityValue);
  const result = await prisma.$transaction(async (tx) => {
    const assignments = await tx.attributionNumberAssignment.deleteMany({ where });
    const records = await tx.attributionRecord.deleteMany({ where });
    const debugEvents = await tx.attributionDebugEvent.deleteMany({ where });
    const snapshots = await tx.attributionSnapshot.deleteMany({ where });

    await tx.auditLog.create({
      data: {
        action: "attribution.privacy.identity_deleted",
        actorId: admin.id,
        entity: "AttributionIdentity",
        entityId: parsed.data.identityValue,
        metadata: {
          identityType: parsed.data.identityType,
          deleted: {
            snapshots: snapshots.count,
            records: records.count,
            numberAssignments: assignments.count,
            debugEvents: debugEvents.count,
          },
        },
      },
    });

    return {
      assignments: assignments.count,
      records: records.count,
      debugEvents: debugEvents.count,
      snapshots: snapshots.count,
    };
  });

  revalidatePath("/settings/attribution/session-settings");
  return {
    ok: true,
    message: `Deleted ${result.snapshots} snapshots, ${result.records} records, ${result.assignments} number leases and ${result.debugEvents} debug events.`,
    savedAt: Date.now(),
  };
}

export async function purgeExpiredAttributionDataAction(
  _: AttributionPrivacyActionState,
): Promise<AttributionPrivacyActionState> {
  void _;
  const admin = await requireAdmin();

  const result = await purgeExpiredAttributionData({
    actorId: admin.id,
    trigger: "manual",
  });

  revalidatePath("/settings/attribution/session-settings");
  return {
    ok: true,
    message: `Purged ${result.snapshots} snapshots, ${result.records} records, ${result.assignments} number leases and ${result.debugEvents} debug events older than ${result.retentionDays} days.`,
    savedAt: Date.now(),
  };
}
