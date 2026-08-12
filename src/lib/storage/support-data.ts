import { FileAssetVisibility } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { documentFileAssetWhere } from "@/lib/storage/file-filters";
import {
  cloudflareR2Provider,
  r2StoredConfigSchema,
} from "@/lib/storage/r2";

const storageSupportDataCacheTag = "storage-support-data";
const storageSupportDataRevalidateSeconds = 60;

export type StorageSupportData = {
  allFileCount: number;
  folderOptions: Array<{ label: string; value: string }>;
  summary: {
    documentFiles: number;
    imageFiles: number;
    otherFiles: number;
    privateFiles: number;
    publicFiles: number;
    recentFiles: number;
    totalBytes: number;
    totalFiles: number;
  };
  uploadPolicy: {
    allowedMimeTypes: string;
    isConfigured: boolean;
    maxUploadMb: number;
  };
  uploaderOptions: Array<{ email: string; id: string; name: string }>;
};

async function loadStorageSupportData(): Promise<StorageSupportData> {
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    allFileCount,
    sizeSummary,
    publicFileCount,
    privateFileCount,
    imageFileCount,
    documentFileCount,
    recentFileCount,
    uploaderOptions,
    folderRows,
    r2Integration,
  ] = await Promise.all([
    prisma.fileAsset.count(),
    prisma.fileAsset.aggregate({ _sum: { sizeBytes: true } }),
    prisma.fileAsset.count({
      where: { visibility: FileAssetVisibility.PUBLIC },
    }),
    prisma.fileAsset.count({
      where: { visibility: FileAssetVisibility.PRIVATE },
    }),
    prisma.fileAsset.count({ where: { mimeType: { startsWith: "image/" } } }),
    prisma.fileAsset.count({ where: documentFileAssetWhere() }),
    prisma.fileAsset.count({ where: { createdAt: { gte: recentCutoff } } }),
    prisma.user.findMany({
      where: { uploadedFiles: { some: {} } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { email: true, id: true, name: true },
    }),
    prisma.fileAsset.findMany({
      orderBy: { key: "asc" },
      select: { key: true },
      take: 5000,
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: cloudflareR2Provider },
      select: { config: true },
    }),
  ]);
  const folderOptions = Array.from(
    new Set(
      folderRows
        .map((row) => {
          const parts = row.key.split("/");
          parts.pop();
          return parts.join("/");
        })
        .filter(Boolean),
    ),
  ).map((folder) => ({
    label: folder,
    value: folder,
  }));
  const r2Config = r2StoredConfigSchema.safeParse(r2Integration?.config ?? {});

  return {
    allFileCount,
    folderOptions,
    summary: {
      documentFiles: documentFileCount,
      imageFiles: imageFileCount,
      otherFiles: Math.max(0, allFileCount - imageFileCount - documentFileCount),
      privateFiles: privateFileCount,
      publicFiles: publicFileCount,
      recentFiles: recentFileCount,
      totalBytes: sizeSummary._sum.sizeBytes ?? 0,
      totalFiles: allFileCount,
    },
    uploadPolicy: {
      allowedMimeTypes: r2Config.success ? r2Config.data.allowedMimeTypes : "",
      isConfigured: Boolean(r2Config.success && r2Config.data.credentials),
      maxUploadMb: r2Config.success ? r2Config.data.maxUploadMb : 25,
    },
    uploaderOptions,
  };
}

export const getStorageSupportData = unstable_cache(
  loadStorageSupportData,
  [storageSupportDataCacheTag],
  {
    revalidate: storageSupportDataRevalidateSeconds,
    tags: [storageSupportDataCacheTag],
  },
);

export function revalidateStorageSupportData() {
  revalidateTag(storageSupportDataCacheTag, "max");
}
