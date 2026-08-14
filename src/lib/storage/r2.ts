import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
  type CompletedPart,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";

export const cloudflareR2Provider = "cloudflare-r2";

export const r2ConfigSchema = z.object({
  accountId: z.string().trim().min(1),
  bucketName: z.string().trim().min(1),
  publicBaseUrl: z.string().trim().url().optional().or(z.literal("")),
  uploadPrefix: z.string().trim().optional().default("crm-assets"),
  maxUploadMb: z.coerce.number().int().positive().max(500).default(25),
  allowedMimeTypes: z
    .string()
    .trim()
    .optional()
    .default("image/*,application/pdf"),
});

const r2StoredCredentialsSchema = z.object({
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  savedAt: z.string().datetime().optional(),
});

export const r2StoredConfigSchema = r2ConfigSchema.extend({
  credentials: r2StoredCredentialsSchema.optional(),
});

export type R2Config = z.infer<typeof r2ConfigSchema>;
export type R2StoredConfig = z.infer<typeof r2StoredConfigSchema>;

export function hasStoredR2Credentials(config: unknown) {
  const parsed = r2StoredConfigSchema.safeParse(config ?? {});
  return Boolean(parsed.success && parsed.data.credentials);
}

function r2ClientForConfig(config: R2StoredConfig) {
  if (!config.credentials) {
    throw new Error("Cloudflare R2 credentials are not configured.");
  }

  return {
    bucketName: config.bucketName,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: decryptSecret(config.credentials.accessKeyId),
        secretAccessKey: decryptSecret(config.credentials.secretAccessKey),
      },
    }),
  };
}

export function r2ConnectionErrorMessage(error: unknown) {
  const status =
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : null;
  const code =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "";

  if (code === "SignatureDoesNotMatch") {
    return "Cloudflare R2 rejected the access key/secret signature. Re-enter the full R2 secret access key and save again.";
  }

  if (status === 403) {
    return "Cloudflare R2 rejected these credentials. Check the API token has read/write access to the selected bucket.";
  }

  if (status === 404 || code === "NoSuchBucket") {
    return "Cloudflare R2 could not find the configured bucket. Check the bucket name and account ID.";
  }

  return "Cloudflare R2 credentials could not be verified. Check the account ID, bucket, access key ID and secret access key.";
}

export async function verifyR2Connection(config: R2StoredConfig) {
  const { bucketName, client } = r2ClientForConfig(config);
  const key = `${config.uploadPrefix || "crm-assets"}/diagnostics/r2-connection-${crypto.randomUUID()}.txt`;

  await client.send(
    new PutObjectCommand({
      Body: Buffer.from("ok"),
      Bucket: bucketName,
      ContentType: "text/plain",
      Key: key,
    }),
  );

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
}

export async function getR2Config() {
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: cloudflareR2Provider },
  });

  const parsed = r2ConfigSchema.safeParse(integration?.config ?? {});
  if (!parsed.success) return null;

  return parsed.data;
}

async function getR2StoredConfig() {
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: cloudflareR2Provider },
  });

  const parsed = r2StoredConfigSchema.safeParse(integration?.config ?? {});
  if (!parsed.success) return null;

  return parsed.data;
}

export async function getR2Client() {
  const config = await getR2StoredConfig();

  if (!config) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  return r2ClientForConfig(config);
}

export async function createR2UploadUrl({
  key,
  contentType,
  expiresIn = 900,
}: {
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  const { bucketName, client } = await getR2Client();

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

export async function putR2Object({
  key,
  body,
  contentType,
}: {
  key: string;
  body: PutObjectCommandInput["Body"];
  contentType: string;
}) {
  const { bucketName, client } = await getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return { bucketName, key };
}

export async function createR2MultipartUpload({
  key,
  contentType,
}: {
  key: string;
  contentType: string;
}) {
  const { bucketName, client } = await getR2Client();
  const response = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    }),
  );

  if (!response.UploadId) {
    throw new Error("R2 multipart upload could not be started.");
  }

  return { bucketName, key, uploadId: response.UploadId };
}

export async function uploadR2MultipartPart({
  body,
  key,
  partNumber,
  uploadId,
}: {
  body: PutObjectCommandInput["Body"];
  key: string;
  partNumber: number;
  uploadId: string;
}) {
  const { bucketName, client } = await getR2Client();
  const response = await client.send(
    new UploadPartCommand({
      Body: body,
      Bucket: bucketName,
      Key: key,
      PartNumber: partNumber,
      UploadId: uploadId,
    }),
  );

  if (!response.ETag) {
    throw new Error("R2 multipart upload part did not return an ETag.");
  }

  return { eTag: response.ETag, partNumber };
}

export async function completeR2MultipartUpload({
  key,
  parts,
  uploadId,
}: {
  key: string;
  parts: CompletedPart[];
  uploadId: string;
}) {
  const { bucketName, client } = await getR2Client();
  const response = await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucketName,
      Key: key,
      MultipartUpload: {
        Parts: parts,
      },
      UploadId: uploadId,
    }),
  );

  return {
    bucketName,
    eTag: response.ETag ?? null,
    key,
  };
}

export async function abortR2MultipartUpload({
  key,
  uploadId,
}: {
  key: string;
  uploadId: string;
}) {
  const { bucketName, client } = await getR2Client();

  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucketName,
      Key: key,
      UploadId: uploadId,
    }),
  );
}

export async function headR2Object({ key }: { key: string }) {
  const { bucketName, client } = await getR2Client();
  const response = await client.send(
    new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );

  return {
    bucketName,
    contentLength: response.ContentLength ?? null,
    contentType: response.ContentType ?? null,
    eTag: response.ETag ?? null,
    key,
  };
}

export async function createR2DownloadUrl({
  key,
  expiresIn = 900,
}: {
  key: string;
  expiresIn?: number;
}) {
  const { bucketName, client } = await getR2Client();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn },
  );
}

export async function getR2ObjectStream({
  key,
  range,
}: {
  key: string;
  range?: string | null;
}) {
  const { bucketName, client } = await getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ...(range ? { Range: range } : {}),
    }),
  );

  if (!response.Body) {
    throw new Error("R2 object body could not be read.");
  }

  return {
    body: response.Body,
    contentLength: response.ContentLength ?? null,
    contentRange: response.ContentRange ?? null,
    contentType: response.ContentType ?? null,
    eTag: response.ETag ?? null,
    lastModified: response.LastModified ?? null,
  };
}

export async function getR2ObjectBytes({ key }: { key: string }) {
  const { bucketName, client } = await getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );

  if (!response.Body || !("transformToByteArray" in response.Body)) {
    throw new Error("R2 object body could not be read.");
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

export async function getR2ObjectRangeBytes({
  end,
  key,
  start = 0,
}: {
  end: number;
  key: string;
  start?: number;
}) {
  const { bucketName, client } = await getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      Range: `bytes=${start}-${end}`,
    }),
  );

  if (!response.Body || !("transformToByteArray" in response.Body)) {
    throw new Error("R2 object body could not be read.");
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

export async function deleteR2Object({ key }: { key: string }) {
  const { bucketName, client } = await getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
}
