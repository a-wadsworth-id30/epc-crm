"use server";

import { requireAdmin } from "@/lib/auth";
import { gmailCleanupPendingTag } from "@/lib/email/attachment-deduplication";
import { runGmailR2LegacyCleanup } from "@/lib/maintenance/gmail-r2-legacy-cleanup";
import { prisma } from "@/lib/prisma";

type CandidatePreview = {
  attachmentLinks: number;
  fileIdPrefix: string | null;
  sizeBytes: number;
};

type LastApplySummary = {
  appliedAt: string;
  detachedAttachments: number;
  failedObjectDeletes: number;
  providerVerificationFailures: number;
  removedBytes: number;
  removedFiles: number;
  skippedAfterRescan: number;
};

export type GmailR2CleanupReport = {
  candidateFilesPreview: CandidatePreview[];
  explicitlySavedBytes: number;
  explicitlySavedFiles: number;
  generatedAt: string;
  gmailFilesScanned: number;
  lastApply: LastApplySummary | null;
  orphanFiles: number;
  protectedBytes: number;
  protectedFiles: number;
  providerBackedFiles: number;
  providerUnavailableBytes: number;
  providerUnavailableFiles: number;
  retryableBytes: number;
  retryableFiles: number;
  wouldDetachAttachments: number;
  wouldRemoveBytes: number;
  wouldRemoveFiles: number;
};

export type GmailR2CleanupReportState = {
  generatedAt: number | null;
  message: string;
  ok: boolean;
  report: GmailR2CleanupReport | null;
};

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function generateGmailR2CleanupReportAction(
  previous: GmailR2CleanupReportState,
  formData: FormData,
): Promise<GmailR2CleanupReportState> {
  void formData;
  const user = await requireAdmin();

  try {
    const [scan, retryableFiles, retryableSize, lastApply] = await Promise.all([
      runGmailR2LegacyCleanup({ prismaClient: prisma }),
      prisma.fileAsset.count({
        where: { tags: { has: gmailCleanupPendingTag } },
      }),
      prisma.fileAsset.aggregate({
        where: { tags: { has: gmailCleanupPendingTag } },
        _sum: { sizeBytes: true },
      }),
      prisma.auditLog.findFirst({
        where: { action: "maintenance.gmail_legacy_r2.cleanup" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, metadata: true },
      }),
    ]);
    const lastApplyMetadata = objectValue(lastApply?.metadata);
    const report: GmailR2CleanupReport = {
      candidateFilesPreview: scan.candidateFilesPreview,
      explicitlySavedBytes: scan.explicitlySavedBytes,
      explicitlySavedFiles: scan.explicitlySavedFiles,
      generatedAt: new Date().toISOString(),
      gmailFilesScanned: scan.gmailFilesScanned,
      lastApply: lastApply
        ? {
            appliedAt: lastApply.createdAt.toISOString(),
            detachedAttachments: numberValue(
              lastApplyMetadata.detachedAttachments,
            ),
            failedObjectDeletes: numberValue(
              lastApplyMetadata.failedObjectDeletes,
            ),
            providerVerificationFailures: numberValue(
              lastApplyMetadata.providerVerificationFailures,
            ),
            removedBytes: numberValue(lastApplyMetadata.removedBytes),
            removedFiles: numberValue(lastApplyMetadata.removedFiles),
            skippedAfterRescan: numberValue(
              lastApplyMetadata.skippedAfterRescan,
            ),
          }
        : null,
      orphanFiles: scan.orphanFiles,
      protectedBytes: scan.protectedBytes,
      protectedFiles: scan.protectedFiles,
      providerBackedFiles: scan.providerBackedFiles,
      providerUnavailableBytes: scan.providerUnavailableBytes,
      providerUnavailableFiles: scan.providerUnavailableFiles,
      retryableBytes: retryableSize._sum.sizeBytes ?? 0,
      retryableFiles,
      wouldDetachAttachments: scan.wouldDetachAttachments,
      wouldRemoveBytes: scan.wouldRemoveBytes,
      wouldRemoveFiles: scan.wouldRemoveFiles,
    };

    await prisma.auditLog.create({
      data: {
        action: "maintenance.gmail_legacy_r2.report",
        actorId: user.id,
        entity: "FileAsset",
        entityId: null,
        metadata: {
          explicitlySavedFiles: report.explicitlySavedFiles,
          gmailFilesScanned: report.gmailFilesScanned,
          protectedFiles: report.protectedFiles,
          providerUnavailableFiles: report.providerUnavailableFiles,
          retryableFiles: report.retryableFiles,
          wouldRemoveBytes: report.wouldRemoveBytes,
          wouldRemoveFiles: report.wouldRemoveFiles,
        },
      },
    });

    return {
      generatedAt: Date.now(),
      message:
        "Safe scan complete. No files, attachment links or R2 objects were changed.",
      ok: true,
      report,
    };
  } catch (error) {
    return {
      generatedAt: Date.now(),
      message:
        error instanceof Error
          ? error.message
          : "The Gmail storage cleanup report could not be generated.",
      ok: false,
      report: previous.report,
    };
  }
}
