import type { Prisma, PrismaClient } from "@prisma/client";
import {
  attachmentChecksum,
  duplicateContentKey,
  gmailSharedImageEntityType,
  gmailSharedImageKey,
  gmailSharedImageTag,
} from "@/lib/email/attachment-deduplication";
import {
  deleteR2Object,
  getR2Config,
  getR2ObjectBytes,
  putR2Object,
} from "@/lib/storage/r2";

type CandidateFile = Prisma.FileAssetGetPayload<{
  select: {
    _count: {
      select: {
        customerDocumentShareFiles: true;
        productImages: true;
        signatureCertificateRequests: true;
        signatureSignedRequests: true;
        signatureSourceRequests: true;
      };
    };
    checksum: true;
    createdAt: true;
    id: true;
    key: true;
    mimeType: true;
    originalName: true;
    sizeBytes: true;
    tags: true;
  };
}>;

type HashedCandidate = CandidateFile & { contentChecksum: string };

export type GmailImageDedupeOptions = {
  applyChanges?: boolean;
  concurrency?: number;
  prismaClient: PrismaClient;
};

function prefix(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function protectedReferenceCount(file: Pick<CandidateFile, "_count">) {
  return (
    file._count.customerDocumentShareFiles +
    file._count.productImages +
    file._count.signatureCertificateRequests +
    file._count.signatureSignedRequests +
    file._count.signatureSourceRequests
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

async function hashCandidate(file: CandidateFile) {
  if (file.checksum) {
    return { file: { ...file, contentChecksum: file.checksum }, error: null };
  }

  try {
    const body = await getR2ObjectBytes({ key: file.key });

    if (body.byteLength !== file.sizeBytes) {
      throw new Error("Stored size does not match the R2 object.");
    }

    return {
      file: { ...file, contentChecksum: attachmentChecksum(body) },
      error: null,
    };
  } catch (error) {
    return {
      file: null,
      error: {
        fileIdPrefix: prefix(file.id),
        message:
          error instanceof Error ? error.message : "R2 image could not be hashed.",
      },
    };
  }
}

function candidateGroups(files: HashedCandidate[]) {
  const groups = new Map<string, HashedCandidate[]>();

  for (const file of files) {
    const key = duplicateContentKey({
      checksum: file.contentChecksum,
      sizeBytes: file.sizeBytes,
    });
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }

  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length);
}

export async function runGmailImageDedupe({
  applyChanges = false,
  concurrency = 6,
  prismaClient,
}: GmailImageDedupeOptions) {
  const files = await prismaClient.fileAsset.findMany({
    where: {
      mimeType: { startsWith: "image/", mode: "insensitive" },
      tags: { has: "gmail" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      _count: {
        select: {
          customerDocumentShareFiles: true,
          productImages: true,
          signatureCertificateRequests: true,
          signatureSignedRequests: true,
          signatureSourceRequests: true,
        },
      },
      checksum: true,
      createdAt: true,
      id: true,
      key: true,
      mimeType: true,
      originalName: true,
      sizeBytes: true,
      tags: true,
    },
  });
  const sizeCounts = new Map<number, number>();

  for (const file of files) {
    sizeCounts.set(file.sizeBytes, (sizeCounts.get(file.sizeBytes) ?? 0) + 1);
  }

  const possibleDuplicates = files.filter(
    (file) => (sizeCounts.get(file.sizeBytes) ?? 0) > 1,
  );
  const hashedResults = await mapWithConcurrency(
    possibleDuplicates,
    Math.max(1, Math.min(12, concurrency)),
    hashCandidate,
  );
  const hashErrors = hashedResults.flatMap((result) =>
    result.error ? [result.error] : [],
  );
  const hashedFiles = hashedResults.flatMap((result) =>
    result.file ? [result.file] : [],
  );
  const duplicateGroups = candidateGroups(hashedFiles);
  const duplicateCopies = duplicateGroups.reduce(
    (total, group) => total + group.length - 1,
    0,
  );
  const reclaimableBytes = duplicateGroups.reduce(
    (total, group) => total + (group.length - 1) * group[0]!.sizeBytes,
    0,
  );
  const summary = {
    candidateImages: files.length,
    duplicateCopies,
    duplicateGroups: duplicateGroups.length,
    duplicateGroupsPreview: duplicateGroups.slice(0, 25).map((group) => ({
      checksumPrefix: prefix(group[0]?.contentChecksum),
      copies: group.length,
      names: Array.from(new Set(group.map((file) => file.originalName))).slice(0, 5),
      reclaimableBytes: (group.length - 1) * group[0]!.sizeBytes,
      sizeBytes: group[0]!.sizeBytes,
    })),
    filesHashed: hashedFiles.length,
    hashErrors: hashErrors.length,
    hashErrorsPreview: hashErrors.slice(0, 25),
    mode: applyChanges ? "apply" : "dry-run",
    possibleDuplicates: possibleDuplicates.length,
    reclaimableBytes,
  };

  if (!applyChanges || duplicateGroups.length === 0) return summary;

  const r2Config = await getR2Config();
  if (!r2Config) throw new Error("Cloudflare R2 is not configured.");

  let canonicalImages = 0;
  let deletedDatabaseFiles = 0;
  let deletedR2Objects = 0;
  let failedR2Deletes = 0;
  let protectedFilesKept = 0;
  let relinkedAttachments = 0;

  for (const group of duplicateGroups) {
    const checksum = group[0]!.contentChecksum;
    const canonicalKey = gmailSharedImageKey({
      checksum,
      uploadPrefix: r2Config.uploadPrefix,
    });
    const source = group[0]!;
    const body = await getR2ObjectBytes({ key: source.key });

    if (
      body.byteLength !== source.sizeBytes ||
      attachmentChecksum(body) !== checksum
    ) {
      throw new Error(
        `Gmail image ${prefix(source.id)} changed after the dry-run scan.`,
      );
    }

    const upload = await putR2Object({
      body,
      contentType: source.mimeType,
      key: canonicalKey,
    });
    const canonical = await prismaClient.fileAsset.upsert({
      where: { key: canonicalKey },
      update: {
        bucket: upload.bucketName,
        checksum,
        entityId: checksum,
        entityType: gmailSharedImageEntityType,
        mimeType: source.mimeType,
        sizeBytes: source.sizeBytes,
        tags: ["email-attachment", "gmail", gmailSharedImageTag],
      },
      create: {
        bucket: upload.bucketName,
        checksum,
        entityId: checksum,
        entityType: gmailSharedImageEntityType,
        key: canonicalKey,
        mimeType: source.mimeType,
        originalName: source.originalName,
        sizeBytes: source.sizeBytes,
        tags: ["email-attachment", "gmail", gmailSharedImageTag],
      },
    });
    canonicalImages += 1;

    const oldFiles = group.filter((file) => file.id !== canonical.id);
    const groupResult = await prismaClient.$transaction(async (tx) => {
      const oldFileIds = oldFiles.map((file) => file.id);
      const [currentFiles, uploadRequestCounts] = await Promise.all([
        tx.fileAsset.findMany({
          where: { id: { in: oldFileIds } },
          select: {
            id: true,
            _count: {
              select: {
                customerDocumentShareFiles: true,
                productImages: true,
                signatureCertificateRequests: true,
                signatureSignedRequests: true,
                signatureSourceRequests: true,
              },
            },
          },
        }),
        tx.customerUploadRequestFile.groupBy({
          by: ["fileAssetId"],
          where: { fileAssetId: { in: oldFileIds } },
          _count: { _all: true },
        }),
      ]);
      const uploadRequestCountById = new Map(
        uploadRequestCounts.map((item) => [
          item.fileAssetId,
          item._count._all,
        ]),
      );
      const deletableFileIds = currentFiles
        .filter(
          (file) =>
            protectedReferenceCount(file) === 0 &&
            (uploadRequestCountById.get(file.id) ?? 0) === 0,
        )
        .map((file) => file.id);
      const relinked = await tx.emailAttachment.updateMany({
        where: { fileAssetId: { in: oldFileIds } },
        data: { fileAssetId: canonical.id },
      });

      if (deletableFileIds.length) {
        await tx.fileAsset.deleteMany({
          where: { id: { in: deletableFileIds } },
        });
      }

      return {
        deletedFileIds: deletableFileIds,
        protectedFilesKept: currentFiles.length - deletableFileIds.length,
        relinkedAttachments: relinked.count,
      };
    });
    const deletedFileIds = new Set(groupResult.deletedFileIds);
    const deletableFiles = oldFiles.filter((file) =>
      deletedFileIds.has(file.id),
    );
    protectedFilesKept += groupResult.protectedFilesKept;
    relinkedAttachments += groupResult.relinkedAttachments;
    deletedDatabaseFiles += deletableFiles.length;

    for (const file of deletableFiles) {
      if (file.key === canonicalKey) continue;

      try {
        await deleteR2Object({ key: file.key });
        deletedR2Objects += 1;
      } catch {
        failedR2Deletes += 1;
      }
    }
  }

  await prismaClient.auditLog.create({
    data: {
      action: "maintenance.gmail_duplicate_images.cleanup",
      actorId: null,
      entity: "FileAsset",
      entityId: null,
      metadata: {
        canonicalImages,
        deletedDatabaseFiles,
        deletedR2Objects,
        duplicateGroups: duplicateGroups.length,
        failedR2Deletes,
        protectedFilesKept,
        relinkedAttachments,
      },
    },
  });

  return {
    ...summary,
    canonicalImages,
    deletedDatabaseFiles,
    deletedR2Objects,
    failedR2Deletes,
    protectedFilesKept,
    relinkedAttachments,
  };
}
