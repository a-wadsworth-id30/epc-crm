import crypto from "node:crypto";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Prisma, PrismaClient } from "@prisma/client";
import { attachmentChecksum } from "@/lib/email/attachment-deduplication";
import { fetchId30AuthWithResilience } from "@/lib/integrations/id30-auth-fetch";
import {
  assessGmailLegacyFileCleanup,
  gmailMessageIdFromCleanupMetadata,
  type GmailLegacyCleanupAttachment,
  summarizeGmailLegacyCleanupAssessments,
  withGmailCleanupPendingTag,
} from "@/lib/maintenance/gmail-r2-legacy-cleanup-policy";

const gmailTag = "gmail";
const cleanupPreviewLimit = 25;
const id30AuthProvider = "id30-auth";
const cloudflareR2Provider = "cloudflare-r2";
const credentialEncryptionAlgorithm = "aes-256-gcm";

type MaintenanceAuthRuntime = {
  baseUrl: string;
  crmClientId: string;
  sharedSecret: string;
  workspaceId: string;
};

type R2DeleteClient = {
  bucketName: string;
  client: S3Client;
};

const cleanupFileSelect = {
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
  emailAttachments: {
    select: {
      id: true,
      providerAttachmentId: true,
      sizeBytes: true,
      emailMessage: {
        select: {
          metadata: true,
          provider: true,
          mailbox: {
            select: {
              authConnectionId: true,
              status: true,
            },
          },
        },
      },
    },
  },
  id: true,
  key: true,
  sizeBytes: true,
  tags: true,
  uploadedById: true,
} satisfies Prisma.FileAssetSelect;

type CleanupFile = Prisma.FileAssetGetPayload<{
  select: typeof cleanupFileSelect;
}>;

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type GmailR2LegacyCleanupOptions = {
  applyChanges?: boolean;
  limit?: number;
  prismaClient: PrismaClient;
};

function prefix(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function encryptionKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!secret) return null;

  const base64Key = Buffer.from(secret, "base64");
  if (base64Key.length === 32) return base64Key;

  const hexKey = Buffer.from(secret, "hex");
  if (hexKey.length === 32) return hexKey;

  return secret.length >= 32
    ? crypto.createHash("sha256").update(secret).digest()
    : null;
}

function decryptSecret(value: string) {
  const key = encryptionKey();
  if (!key) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is missing or invalid.");
  }

  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error(
      "Encrypted iD30 Auth credentials have an unsupported format.",
    );
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

async function maintenanceAuthRuntime(
  prismaClient: PrismaClient,
): Promise<MaintenanceAuthRuntime | null> {
  const connection = await prismaClient.integrationConnection.findUnique({
    where: { provider: id30AuthProvider },
    select: { config: true, status: true },
  });
  const config = jsonObject(connection?.config);
  const credentials = jsonObject(config?.credentials);
  const storedBaseUrl = config?.baseUrl;
  const storedCrmClientId = config?.crmClientId;
  const storedWorkspaceId = config?.workspaceId;
  const encryptedSecret = credentials?.sharedSecret;

  if (
    connection?.status === "CONNECTED" &&
    typeof storedBaseUrl === "string" &&
    typeof storedCrmClientId === "string" &&
    typeof storedWorkspaceId === "string" &&
    typeof encryptedSecret === "string"
  ) {
    return {
      baseUrl: storedBaseUrl.replace(/\/+$/, ""),
      crmClientId: storedCrmClientId,
      sharedSecret: decryptSecret(encryptedSecret),
      workspaceId: storedWorkspaceId,
    };
  }

  const baseUrl = process.env.ID30_AUTH_BASE_URL?.trim().replace(/\/+$/, "");
  const crmClientId = process.env.ID30_AUTH_CRM_CLIENT_ID?.trim();
  const workspaceId = process.env.ID30_AUTH_WORKSPACE_ID?.trim() || crmClientId;
  const sharedSecret = process.env.ID30_AUTH_SHARED_SECRET?.trim();

  return baseUrl && crmClientId && workspaceId && sharedSecret
    ? { baseUrl, crmClientId, sharedSecret, workspaceId }
    : null;
}

async function r2DeleteClient(
  prismaClient: PrismaClient,
): Promise<R2DeleteClient> {
  const connection = await prismaClient.integrationConnection.findUnique({
    where: { provider: cloudflareR2Provider },
    select: { config: true },
  });
  const config = jsonObject(connection?.config);
  const credentials = jsonObject(config?.credentials);
  const accountId = config?.accountId;
  const bucketName = config?.bucketName;
  const accessKeyId = credentials?.accessKeyId;
  const secretAccessKey = credentials?.secretAccessKey;

  if (
    typeof accountId !== "string" ||
    typeof bucketName !== "string" ||
    typeof accessKeyId !== "string" ||
    typeof secretAccessKey !== "string"
  ) {
    throw new Error("Cloudflare R2 credentials are not configured.");
  }

  return {
    bucketName,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: decryptSecret(accessKeyId),
        secretAccessKey: decryptSecret(secretAccessKey),
      },
    }),
  };
}

async function deleteR2File(r2: R2DeleteClient, key: string) {
  await r2.client.send(
    new DeleteObjectCommand({ Bucket: r2.bucketName, Key: key }),
  );
}

function signedAuthHeaders({
  body,
  connectionId,
  pathname,
  runtime,
}: {
  body: string;
  connectionId: string;
  pathname: string;
  runtime: MaintenanceAuthRuntime;
}) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const requestId = crypto.randomUUID();
  const contentDigest = crypto
    .createHash("sha256")
    .update(body)
    .digest("base64url");
  const signaturePayload = [
    "POST",
    pathname,
    runtime.crmClientId,
    runtime.workspaceId,
    connectionId,
    requestId,
    issuedAt.toISOString(),
    expiresAt.toISOString(),
    contentDigest,
  ].join("\n");
  const signature = crypto
    .createHmac("sha256", runtime.sharedSecret)
    .update(signaturePayload)
    .digest("base64url");

  return {
    "content-type": "application/json",
    "x-id30-content-sha256": contentDigest,
    "x-id30-crm-client-id": runtime.crmClientId,
    "x-id30-crm-request-id": requestId,
    "x-id30-workspace-id": runtime.workspaceId,
    "x-id30-issued-at": issuedAt.toISOString(),
    "x-id30-expires-at": expiresAt.toISOString(),
    "x-id30-signature": signature,
  };
}

async function fetchProviderAttachment({
  authConnectionId,
  gmailMessageId,
  providerAttachmentId,
  runtime,
}: {
  authConnectionId: string;
  gmailMessageId: string;
  providerAttachmentId: string;
  runtime: MaintenanceAuthRuntime;
}) {
  const pathname = `/api/crm/connections/${encodeURIComponent(authConnectionId)}/gmail/attachment`;
  const body = JSON.stringify({
    attachmentId: providerAttachmentId,
    messageId: gmailMessageId,
  });
  const brokerResponse = await fetchId30AuthWithResilience({
    method: "POST",
    requestInit: () => ({
      body,
      cache: "no-store",
      headers: signedAuthHeaders({
        body,
        connectionId: authConnectionId,
        pathname,
        runtime,
      }),
    }),
    url: new URL(pathname, runtime.baseUrl),
  });

  if (!brokerResponse.ok) {
    throw new Error("Gmail attachment verification could not reach iD30 Auth.");
  }

  const { response } = brokerResponse;
  const responseBody = jsonObject(await response.json().catch(() => null));
  const result = jsonObject(responseBody?.result);
  const encodedData = result?.data;

  if (!response.ok || typeof encodedData !== "string" || !encodedData) {
    throw new Error("Gmail attachment verification failed.");
  }

  return Buffer.from(encodedData, "base64url");
}

function protectedReferenceCount(file: CleanupFile) {
  return (
    file._count.customerDocumentShareFiles +
    file._count.productImages +
    file._count.signatureCertificateRequests +
    file._count.signatureSignedRequests +
    file._count.signatureSourceRequests
  );
}

async function uploadRequestReferenceCounts(
  prismaClient: PrismaLike,
  fileIds: string[],
) {
  if (fileIds.length === 0) return new Map<string, number>();

  const rows = await prismaClient.customerUploadRequestFile.groupBy({
    by: ["fileAssetId"],
    where: { fileAssetId: { in: fileIds } },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.fileAssetId, row._count._all]));
}

function policyFile(
  file: CleanupFile,
  uploadRequestReferences: Map<string, number>,
) {
  return {
    attachments: file.emailAttachments as GmailLegacyCleanupAttachment[],
    protectedReferenceCount:
      protectedReferenceCount(file) +
      (uploadRequestReferences.get(file.id) ?? 0),
    tags: file.tags,
    uploadedById: file.uploadedById,
  };
}

async function findCleanupFiles(prismaClient: PrismaLike) {
  return prismaClient.fileAsset.findMany({
    where: { tags: { has: gmailTag } },
    orderBy: { createdAt: "asc" },
    select: cleanupFileSelect,
  });
}

function candidateSummary(file: CleanupFile) {
  return {
    attachmentLinks: file.emailAttachments.length,
    fileIdPrefix: prefix(file.id),
    sizeBytes: file.sizeBytes,
  };
}

async function verifyProviderCopies(
  file: CleanupFile,
  runtime: MaintenanceAuthRuntime,
) {
  let representativeBytes: Buffer | null = null;

  for (const attachment of file.emailAttachments) {
    const mailbox = attachment.emailMessage.mailbox;
    const providerAttachmentId = attachment.providerAttachmentId;
    const gmailMessageId = gmailMessageIdFromCleanupMetadata(
      attachment.emailMessage.metadata,
    );

    if (!mailbox || !providerAttachmentId || !gmailMessageId) return null;

    try {
      const bytes = await fetchProviderAttachment({
        authConnectionId: mailbox.authConnectionId,
        gmailMessageId,
        providerAttachmentId,
        runtime,
      });

      if (
        (attachment.sizeBytes !== null &&
          attachment.sizeBytes !== bytes.byteLength) ||
        (file.checksum && attachmentChecksum(bytes) !== file.checksum)
      ) {
        return null;
      }

      representativeBytes ??= bytes;
    } catch {
      return null;
    }
  }

  return representativeBytes ?? Buffer.alloc(0);
}

async function currentEligibleFile(prismaClient: PrismaLike, fileId: string) {
  const file = await prismaClient.fileAsset.findUnique({
    where: { id: fileId },
    select: cleanupFileSelect,
  });
  if (!file) return null;

  const uploadRequestReferences = await uploadRequestReferenceCounts(
    prismaClient,
    [file.id],
  );
  const assessment = assessGmailLegacyFileCleanup(
    policyFile(file, uploadRequestReferences),
  );

  return assessment.eligible ? file : null;
}

export async function runGmailR2LegacyCleanup({
  applyChanges = false,
  limit = 100,
  prismaClient,
}: GmailR2LegacyCleanupOptions) {
  const files = await findCleanupFiles(prismaClient);
  const uploadRequestReferences = await uploadRequestReferenceCounts(
    prismaClient,
    files.map((file) => file.id),
  );
  const assessed = files.map((file) => ({
    assessment: assessGmailLegacyFileCleanup(
      policyFile(file, uploadRequestReferences),
    ),
    file,
  }));
  const candidates = assessed.filter((item) => item.assessment.eligible);
  const assessmentSummary = summarizeGmailLegacyCleanupAssessments(
    assessed.map((item) => ({
      assessment: item.assessment,
      attachmentLinks: item.file.emailAttachments.length,
      sizeBytes: item.file.sizeBytes,
    })),
  );
  const baseSummary = {
    ...assessmentSummary,
    candidateFilesPreview: candidates
      .slice(0, cleanupPreviewLimit)
      .map((item) => candidateSummary(item.file)),
    gmailFilesScanned: files.length,
    mode: applyChanges ? "apply" : "dry-run",
  };

  if (!applyChanges || candidates.length === 0) return baseSummary;

  const applyLimit = Math.max(1, Math.min(500, limit));
  const appliedCandidates = candidates.slice(0, applyLimit);
  const r2 = await r2DeleteClient(prismaClient);
  const authRuntime = appliedCandidates.some(
    (item) => item.file.emailAttachments.length > 0,
  )
    ? await maintenanceAuthRuntime(prismaClient)
    : null;
  if (
    appliedCandidates.some((item) => item.file.emailAttachments.length > 0) &&
    !authRuntime
  ) {
    throw new Error(
      "iD30 Auth is not configured; Gmail copies cannot be verified safely.",
    );
  }
  let detachedAttachments = 0;
  let failedObjectDeletes = 0;
  let providerVerificationFailures = 0;
  let removedBytes = 0;
  let removedFiles = 0;
  let skippedAfterRescan = 0;

  for (const candidate of appliedCandidates) {
    const current = await currentEligibleFile(prismaClient, candidate.file.id);
    if (!current) {
      skippedAfterRescan += 1;
      continue;
    }

    const providerBytes =
      current.emailAttachments.length > 0
        ? await verifyProviderCopies(current, authRuntime!)
        : Buffer.alloc(0);
    if (!providerBytes) {
      providerVerificationFailures += 1;
      continue;
    }

    const detached = await prismaClient.$transaction(async (tx) => {
      const fresh = await currentEligibleFile(tx, current.id);
      if (!fresh) return null;

      const attachmentUpdate = await tx.emailAttachment.updateMany({
        where: { fileAssetId: fresh.id },
        data: {
          archiveStatus: "REFERENCE",
          fileAssetId: null,
          lastError: null,
        },
      });
      await tx.fileAsset.update({
        where: { id: fresh.id },
        data: { tags: withGmailCleanupPendingTag(fresh.tags) },
      });

      return { attachmentCount: attachmentUpdate.count, file: fresh };
    });

    if (!detached) {
      skippedAfterRescan += 1;
      continue;
    }
    detachedAttachments += detached.attachmentCount;

    try {
      await deleteR2File(r2, detached.file.key);
    } catch {
      failedObjectDeletes += 1;
      continue;
    }

    const deleted = await prismaClient.$transaction(async (tx) => {
      const fresh = await currentEligibleFile(tx, detached.file.id);
      if (!fresh || fresh.emailAttachments.length > 0) return false;

      await tx.fileAsset.delete({ where: { id: fresh.id } });
      return true;
    });

    if (deleted) {
      removedFiles += 1;
      removedBytes += detached.file.sizeBytes;
    } else {
      skippedAfterRescan += 1;
    }
  }

  await prismaClient.auditLog.create({
    data: {
      action: "maintenance.gmail_legacy_r2.cleanup",
      actorId: null,
      entity: "FileAsset",
      entityId: null,
      metadata: {
        applyLimit,
        detachedAttachments,
        failedObjectDeletes,
        providerVerificationFailures,
        removedBytes,
        removedFiles,
        skippedAfterRescan,
      },
    },
  });

  return {
    ...baseSummary,
    applyLimit,
    detachedAttachments,
    failedObjectDeletes,
    providerVerificationFailures,
    remainingCandidateFiles: Math.max(0, candidates.length - applyLimit),
    removedBytes,
    removedFiles,
    skippedAfterRescan,
  };
}
