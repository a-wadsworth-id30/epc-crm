"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { calculateAttributionConfidence } from "@/lib/marketing/attribution-confidence";
import { prisma } from "@/lib/prisma";

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function saveAttributionConfidenceSnapshotAction(formData: FormData) {
  const user = await requireAdmin();
  const snapshotId = formData.get("snapshotId");

  if (!isString(snapshotId)) {
    throw new Error("Visitor snapshot ID is required.");
  }

  const snapshot = await prisma.attributionSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      records: true,
      debugEvents: true,
    },
  });

  if (!snapshot) {
    throw new Error("Visitor snapshot was not found.");
  }

  const formConversions = snapshot.records.filter((record) => record.source === "FORM").length;
  const phoneConversions = snapshot.records.filter((record) => record.source === "PHONE").length;
  const manualConversions = snapshot.records.filter((record) => record.source === "MANUAL").length;
  const confidence = calculateAttributionConfidence({
    firstTouch: snapshot.firstTouch,
    lastTouch: snapshot.lastTouch,
    timeline: snapshot.timeline,
    landingPage: snapshot.landingPage,
    currentPage: snapshot.currentPage,
    referrer: snapshot.referrer,
    attributionSource: snapshot.attributionSource,
    attributionMedium: snapshot.attributionMedium,
    attributionCampaign: snapshot.attributionCampaign,
    attributionClickId: snapshot.attributionClickId,
    attributionClickIdType: snapshot.attributionClickIdType,
    recordsCount: snapshot.records.length,
    formConversionsCount: formConversions,
    phoneConversionsCount: phoneConversions,
    manualConversionsCount: manualConversions,
    matchedContactId: snapshot.records.find((record) => record.contactId)?.contactId ?? null,
    matchedOpportunityId:
      snapshot.records.find((record) => record.opportunityId)?.opportunityId ?? null,
    consentGranted: snapshot.debugEvents.some((event) => event.eventType === "consent.granted"),
  });

  await prisma.attributionConfidenceSnapshot.create({
    data: {
      attributionSnapshotId: snapshot.id,
      level: confidence.level,
      score: confidence.score,
      maxScore: confidence.maxScore,
      percentage: confidence.percentage,
      clientSummary: confidence.clientSummary,
      factors: safeJson(confidence.factors),
      presentFactors: safeJson(confidence.presentFactors),
      missingFactors: safeJson(confidence.missingFactors),
      internalReasons: safeJson(confidence.internalReasons),
      metadata: safeJson({
        recordsCount: snapshot.records.length,
        source: "visitor-detail",
      }),
      createdByUserId: user.id,
    },
  });

  revalidatePath(`/marketing/visitors/${snapshot.id}`);
}
