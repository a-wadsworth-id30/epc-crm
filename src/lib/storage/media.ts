import "server-only";

import crypto from "node:crypto";
import { FileAssetVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidateStorageSupportData } from "@/lib/storage/support-data";
import {
  cloudflareR2Provider,
  getR2Config,
  putR2Object,
} from "@/lib/storage/r2";

const fallbackUploadPrefix = "crm-assets";

export function sanitizeMediaPathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function mediaFileExtension(fileName: string, contentType: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!contentType && extension && extension !== fileName.toLowerCase()) {
    return extension.replace(/[^a-z0-9]/g, "");
  }

  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/avif") return "avif";
  if (contentType === "image/heic") return "heic";
  if (contentType === "application/pdf") return "pdf";

  return "bin";
}

export function sniffMediaMimeType(body: Buffer) {
  if (
    body.length >= 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body.toString("ascii", 1, 4) === "PNG" &&
    body[4] === 0x0d &&
    body[5] === 0x0a &&
    body[6] === 0x1a &&
    body[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    body.length >= 6 &&
    (body.toString("ascii", 0, 6) === "GIF87a" ||
      body.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return "image/gif";
  }

  if (
    body.length >= 12 &&
    body.toString("ascii", 0, 4) === "RIFF" &&
    body.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  if (body.length >= 12 && body.toString("ascii", 4, 8) === "ftyp") {
    const brand = body.toString("ascii", 8, 16);

    if (brand.includes("avif") || brand.includes("avis")) {
      return "image/avif";
    }

    if (
      ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].some((value) =>
        brand.includes(value),
      )
    ) {
      return "image/heic";
    }
  }

  if (body.length >= 5 && body.toString("ascii", 0, 5) === "%PDF-") {
    return "application/pdf";
  }

  return null;
}

export function normaliseMediaMimeType(value: string) {
  const mimeType = value.toLowerCase().split(";")[0]?.trim() ?? "";

  if (mimeType === "image/jpg") return "image/jpeg";

  return mimeType;
}

export function isSvgMediaUpload({
  body,
  fileName,
  mimeType,
}: {
  body: Buffer;
  fileName: string;
  mimeType: string;
}) {
  const declaredMimeType = normaliseMediaMimeType(mimeType);
  const normalizedFileName = fileName.toLowerCase();
  const head = body.subarray(0, 512).toString("utf8").toLowerCase();

  return (
    declaredMimeType === "image/svg+xml" ||
    normalizedFileName.endsWith(".svg") ||
    /<\s*svg[\s>]/.test(head)
  );
}

function mimeTypesCompatible(declaredMimeType: string, detectedMimeType: string) {
  if (!declaredMimeType || declaredMimeType === "application/octet-stream") {
    return true;
  }

  return normaliseMediaMimeType(declaredMimeType) === normaliseMediaMimeType(detectedMimeType);
}

export function mediaMimeMatches(mimeType: string, allowedMimeTypes: string) {
  const allowed = allowedMimeTypes
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const normalizedMimeType = mimeType.toLowerCase();

  return allowed.some((allowedType) => {
    if (allowedType.endsWith("/*")) {
      return normalizedMimeType.startsWith(allowedType.replace("/*", "/"));
    }

    return normalizedMimeType === allowedType;
  });
}

export function mediaAssetUrl(fileAssetId: string) {
  return `/api/media/${fileAssetId}`;
}

export function mediaObjectKey({
  contentType,
  fileName,
  folder,
  uploadPrefix,
}: {
  contentType: string;
  fileName: string;
  folder: string;
  uploadPrefix: string;
}) {
  const extension = mediaFileExtension(fileName, contentType);
  const normalizedUploadPrefix = sanitizeMediaPathSegment(
    uploadPrefix || fallbackUploadPrefix,
  );
  const folderPath = folder
    .split("/")
    .map(sanitizeMediaPathSegment)
    .filter(Boolean)
    .join("/");

  return `${normalizedUploadPrefix}/media/${folderPath}/${crypto.randomUUID()}.${extension}`;
}

export function validateMediaObjectHead({
  allowedMimeTypes,
  body,
  fileName,
  mimeType,
  requireImage = false,
}: {
  allowedMimeTypes: string;
  body: Buffer;
  fileName: string;
  mimeType: string;
  requireImage?: boolean;
}) {
  const declaredMimeType = normaliseMediaMimeType(mimeType);
  const detectedMimeType = sniffMediaMimeType(body);
  const effectiveMimeType = detectedMimeType ?? declaredMimeType;

  if (isSvgMediaUpload({ body, fileName, mimeType })) {
    throw new Error("SVG uploads are not supported. Upload a raster image file.");
  }

  if (
    detectedMimeType &&
    declaredMimeType &&
    !mimeTypesCompatible(declaredMimeType, detectedMimeType)
  ) {
    throw new Error("The uploaded file content does not match its file type.");
  }

  if (
    (requireImage ||
      declaredMimeType.startsWith("image/") ||
      declaredMimeType === "application/pdf") &&
    !detectedMimeType
  ) {
    throw new Error("The uploaded file type could not be verified.");
  }

  if (requireImage && !effectiveMimeType.startsWith("image/")) {
    throw new Error("Upload an image file.");
  }

  if (!mediaMimeMatches(effectiveMimeType, allowedMimeTypes)) {
    throw new Error(
      "This file type is not allowed by the R2 integration settings.",
    );
  }

  return {
    detectedMimeType,
    effectiveMimeType: effectiveMimeType || "application/octet-stream",
  };
}

export async function createStoredMediaFileAsset({
  bucket,
  checksum,
  documentFolder,
  documentUploadType,
  entityId,
  entityType,
  key,
  mimeType,
  notes,
  originalName,
  sizeBytes,
  tags,
  uploadedById,
  visibility = FileAssetVisibility.PRIVATE,
}: {
  bucket: string;
  checksum?: string | null;
  documentFolder?: string;
  documentUploadType?: string | null;
  entityType?: string;
  entityId?: string;
  key: string;
  mimeType: string;
  notes?: string | null;
  originalName: string;
  sizeBytes: number;
  tags?: string[];
  uploadedById?: string | null;
  visibility?: FileAssetVisibility;
}) {
  const fileAsset = await prisma.fileAsset.create({
    data: {
      storageProvider: cloudflareR2Provider,
      bucket,
      key,
      originalName,
      mimeType,
      sizeBytes,
      checksum,
      documentFolder,
      documentUploadType,
      entityType,
      entityId,
      notes,
      tags,
      visibility,
      uploadedById,
    },
  });

  revalidateStorageSupportData();

  return fileAsset;
}

export async function uploadMediaFile({
  file,
  folder,
  documentFolder,
  documentUploadType,
  entityType,
  entityId,
  uploadedById,
  notes,
  tags,
  visibility = FileAssetVisibility.PRIVATE,
  maxUploadMb,
  requireImage = false,
}: {
  file: File;
  folder: string;
  documentFolder?: string;
  documentUploadType?: string | null;
  entityType?: string;
  entityId?: string;
  uploadedById?: string;
  notes?: string | null;
  tags?: string[];
  visibility?: FileAssetVisibility;
  maxUploadMb?: number;
  requireImage?: boolean;
}) {
  if (!file || file.size === 0) {
    throw new Error("Choose a file to upload.");
  }

  const config = await getR2Config();

  if (!config) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  const maxMb = maxUploadMb ?? config.maxUploadMb;
  const maxBytes = maxMb * 1024 * 1024;

  if (file.size > maxBytes) {
    throw new Error(`File must be ${maxMb}MB or smaller.`);
  }

  const declaredMimeType = normaliseMediaMimeType(file.type);

  const arrayBuffer = await file.arrayBuffer();
  const body = Buffer.from(arrayBuffer);
  const { effectiveMimeType } = validateMediaObjectHead({
    allowedMimeTypes: config.allowedMimeTypes,
    body,
    fileName: file.name,
    mimeType: declaredMimeType,
    requireImage,
  });

  const checksum = crypto.createHash("sha256").update(body).digest("hex");
  const key = mediaObjectKey({
    contentType: effectiveMimeType,
    fileName: file.name,
    folder,
    uploadPrefix: config.uploadPrefix,
  });
  const upload = await putR2Object({
    key,
    body,
    contentType: effectiveMimeType || "application/octet-stream",
  });

  const fileAsset = await createStoredMediaFileAsset({
    bucket: upload.bucketName,
    checksum,
    documentFolder,
    documentUploadType,
    entityId,
    entityType,
    key: upload.key,
    mimeType: effectiveMimeType,
    notes,
    originalName:
      file.name || `upload.${mediaFileExtension(file.name, effectiveMimeType)}`,
    sizeBytes: file.size,
    tags,
    uploadedById,
    visibility,
  });

  return fileAsset;
}
