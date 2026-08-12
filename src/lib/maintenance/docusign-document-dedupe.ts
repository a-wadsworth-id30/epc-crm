import crypto from "node:crypto";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Prisma, PrismaClient } from "@prisma/client";

const docusignAutoStoredNote =
  "Stored automatically from a completed DocuSign envelope.";
const cloudflareR2Provider = "cloudflare-r2";
const credentialEncryptionAlgorithm = "aes-256-gcm";

export type DocusignDuplicateDocumentCleanupOptions = {
  applyChanges?: boolean;
  entityIdFilter?: string | null;
  entityTypeFilter?: string | null;
  prismaClient: PrismaClient;
};

function prefix(value: string | null | undefined) {
  return value ? value.slice(0, 8) : null;
}

function documentRole(tags: string[]) {
  if (tags.includes("certificate")) return "certificate";
  if (tags.includes("signed")) return "signed";

  return "unknown";
}

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
    documentFolder: true;
    documentUploadType: true;
    entityId: true;
    entityType: true;
    id: true;
    key: true;
    mimeType: true;
    originalName: true;
    sizeBytes: true;
    tags: true;
  };
}>;

function protectedReferenceCount(
  file: CandidateFile,
  uploadRequestFileCounts: Map<string, number>,
) {
  return (
    (uploadRequestFileCounts.get(file.id) ?? 0) +
    file._count.customerDocumentShareFiles +
    file._count.productImages +
    file._count.signatureCertificateRequests +
    file._count.signatureSignedRequests +
    file._count.signatureSourceRequests
  );
}

function roleReferenceCount(file: CandidateFile, role: string) {
  if (role === "certificate") return file._count.signatureCertificateRequests;
  if (role === "signed") return file._count.signatureSignedRequests;

  return 0;
}

function groupKey(file: CandidateFile) {
  return [
    file.entityType,
    file.entityId,
    file.documentFolder,
    file.documentUploadType,
    file.mimeType,
    file.checksum,
    documentRole(file.tags),
    file.originalName,
  ].join("|");
}

function sortOldestFirst(a: CandidateFile, b: CandidateFile) {
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function getEncryptionKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!secret) return null;

  const base64Key = Buffer.from(secret, "base64");
  if (base64Key.length === 32) return base64Key;

  const hexKey = Buffer.from(secret, "hex");
  if (hexKey.length === 32) return hexKey;

  if (secret.length >= 32) return crypto.createHash("sha256").update(secret).digest();

  return null;
}

function decryptSecret(value: string) {
  const key = getEncryptionKey();

  if (!key) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is missing or invalid.");
  }

  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Encrypted secret has an unsupported format.");
  }

  const decipher = crypto.createDecipheriv(
    credentialEncryptionAlgorithm,
    key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function stringConfigValue(config: Prisma.JsonValue, key: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;

  const value = (config as Record<string, Prisma.JsonValue>)[key];

  return typeof value === "string" ? value : null;
}

function credentialsConfigValue(config: Prisma.JsonValue) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;

  const value = (config as Record<string, Prisma.JsonValue>).credentials;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const credentials = value as Record<string, Prisma.JsonValue>;
  const accessKeyId = credentials.accessKeyId;
  const secretAccessKey = credentials.secretAccessKey;

  if (typeof accessKeyId !== "string" || typeof secretAccessKey !== "string") {
    return null;
  }

  return { accessKeyId, secretAccessKey };
}

async function createR2DeleteClient(prismaClient: PrismaClient) {
  const integration = await prismaClient.integrationConnection.findUnique({
    where: { provider: cloudflareR2Provider },
    select: { config: true },
  });

  const config = integration?.config;
  if (!config) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  const accountId = stringConfigValue(config, "accountId");
  const bucketName = stringConfigValue(config, "bucketName");
  const credentials = credentialsConfigValue(config);

  if (!accountId || !bucketName || !credentials) {
    throw new Error("Cloudflare R2 credentials are not configured.");
  }

  return {
    bucketName,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: decryptSecret(credentials.accessKeyId),
        secretAccessKey: decryptSecret(credentials.secretAccessKey),
      },
    }),
  };
}

async function deleteR2Object({
  bucketName,
  client,
  key,
}: {
  bucketName: string;
  client: S3Client;
  key: string;
}) {
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
}

export async function runDocusignDuplicateDocumentCleanup({
  applyChanges = false,
  entityIdFilter,
  entityTypeFilter,
  prismaClient,
}: DocusignDuplicateDocumentCleanupOptions) {
  const where: Prisma.FileAssetWhereInput = {
    checksum: { not: null },
    documentFolder: "contracts-and-finance",
    documentUploadType: "contract",
    entityId: { not: null },
    entityType: { not: null },
    mimeType: "application/pdf",
    notes: docusignAutoStoredNote,
    tags: { has: "docusign" },
    OR: [{ tags: { has: "signed" } }, { tags: { has: "certificate" } }],
    ...(entityTypeFilter ? { entityType: entityTypeFilter } : {}),
    ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
  };
  const files = await prismaClient.fileAsset.findMany({
    where,
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
      documentFolder: true,
      documentUploadType: true,
      entityId: true,
      entityType: true,
      id: true,
      key: true,
      mimeType: true,
      originalName: true,
      sizeBytes: true,
      tags: true,
    },
  });
  const uploadRequestFileCounts = new Map<string, number>();

  if (files.length) {
    const uploadRequestFileLinks = await prismaClient.customerUploadRequestFile.groupBy({
      by: ["fileAssetId"],
      where: { fileAssetId: { in: files.map((file) => file.id) } },
      _count: { _all: true },
    });

    for (const link of uploadRequestFileLinks) {
      uploadRequestFileCounts.set(link.fileAssetId, link._count._all);
    }
  }

  const groups = new Map<string, CandidateFile[]>();

  for (const file of files) {
    const key = groupKey(file);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }

  const duplicateGroups = Array.from(groups.values()).filter(
    (group) => group.length > 1,
  );
  const deleteCandidates: CandidateFile[] = [];
  let protectedDuplicateFiles = 0;

  const groupSummaries = duplicateGroups.map((group) => {
    const ordered = [...group].sort(sortOldestFirst);
    const role = documentRole(ordered[0]?.tags ?? []);
    const referenced = ordered.filter(
      (file) =>
        roleReferenceCount(file, role) > 0 ||
        protectedReferenceCount(file, uploadRequestFileCounts) > 0,
    );
    const keepIds = new Set<string>(
      referenced.length ? referenced.map((file) => file.id) : [ordered[0]!.id],
    );
    const groupDeleteCandidates = ordered.filter(
      (file) =>
        !keepIds.has(file.id) &&
        protectedReferenceCount(file, uploadRequestFileCounts) === 0,
    );
    const groupProtectedDuplicates = ordered.filter(
      (file) =>
        !keepIds.has(file.id) &&
        protectedReferenceCount(file, uploadRequestFileCounts) > 0,
    ).length;

    deleteCandidates.push(...groupDeleteCandidates);
    protectedDuplicateFiles += groupProtectedDuplicates;

    return {
      checksumPrefix: prefix(ordered[0]?.checksum),
      copies: ordered.length,
      deleteCandidates: groupDeleteCandidates.length,
      entityIdPrefix: prefix(ordered[0]?.entityId),
      entityType: ordered[0]?.entityType ?? null,
      keptCopies: keepIds.size,
      protectedDuplicatesSkipped: groupProtectedDuplicates,
      role,
      sizeBytes: ordered[0]?.sizeBytes ?? 0,
    };
  });

  const summary = {
    candidateFilesScanned: files.length,
    duplicateGroups: duplicateGroups.length,
    duplicateGroupsPreview: groupSummaries.slice(0, 25),
    entityIdFilter: entityIdFilter ? prefix(entityIdFilter) : null,
    entityTypeFilter: entityTypeFilter ?? null,
    mode: applyChanges ? "apply" : "dry-run",
    protectedDuplicateFiles,
    totalDuplicateFilesInGroups: duplicateGroups.reduce(
      (total, group) => total + group.length,
      0,
    ),
    wouldDeleteFiles: deleteCandidates.length,
    wouldDeleteBytes: deleteCandidates.reduce(
      (total, file) => total + file.sizeBytes,
      0,
    ),
  };

  if (!applyChanges) {
    return summary;
  }

  const r2DeleteClient =
    deleteCandidates.length > 0 ? await createR2DeleteClient(prismaClient) : null;
  let deletedFiles = 0;
  let failedDeletes = 0;
  let failedObjectDeletes = 0;
  let skippedAfterRescan = 0;

  for (const file of deleteCandidates) {
    let deletedFile: CandidateFile | null = null;

    try {
      const uploadRequestFileLinks = await prismaClient.customerUploadRequestFile.count({
        where: { fileAssetId: file.id },
      });
      const currentFile = await prismaClient.fileAsset.findUnique({
        where: { id: file.id },
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
        },
      });

      if (!currentFile) {
        skippedAfterRescan += 1;
        continue;
      }

      const currentReferenceCount =
        uploadRequestFileLinks +
        currentFile._count.customerDocumentShareFiles +
        currentFile._count.productImages +
        currentFile._count.signatureCertificateRequests +
        currentFile._count.signatureSignedRequests +
        currentFile._count.signatureSourceRequests;

      if (currentReferenceCount > 0) {
        skippedAfterRescan += 1;
        continue;
      }

      await prismaClient.fileAsset.delete({ where: { id: file.id } });
      deletedFiles += 1;
      deletedFile = file;
    } catch (error) {
      failedDeletes += 1;
      console.error(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Duplicate DocuSign file could not be deleted.",
          fileIdPrefix: prefix(file.id),
        }),
      );
    }

    if (deletedFile && r2DeleteClient) {
      try {
        await deleteR2Object({
          ...r2DeleteClient,
          key: deletedFile.key,
        });
      } catch (error) {
        failedObjectDeletes += 1;
        console.error(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Duplicate DocuSign object could not be deleted from R2.",
            fileIdPrefix: prefix(deletedFile.id),
          }),
        );
      }
    }
  }

  await prismaClient.auditLog.create({
    data: {
      action: "maintenance.docusign_duplicate_documents.cleanup",
      actorId: null,
      entity: "FileAsset",
      entityId: null,
      metadata: {
        deletedFiles,
        duplicateGroups: summary.duplicateGroups,
        entityIdFilter: summary.entityIdFilter,
        entityTypeFilter: summary.entityTypeFilter,
        failedDeletes,
        failedObjectDeletes,
        protectedDuplicateFiles,
        scanned: files.length,
        skippedAfterRescan,
        wouldDeleteFiles: summary.wouldDeleteFiles,
      },
    },
  });

  return {
    ...summary,
    deletedFiles,
    failedDeletes,
    failedObjectDeletes,
    skippedAfterRescan,
  };
}
