import "server-only";

import { prisma } from "@/lib/prisma";

export type CustomerUploadPublicFile = {
  id: string;
  mimeType: string;
  name: string;
  receivedAt: string;
  sizeBytes: number;
};

type CustomerUploadFileLink = {
  createdAt: Date;
  fileAssetId: string;
};

export async function customerUploadPublicFilesByItemId(
  items: Array<{ files: CustomerUploadFileLink[]; id: string }>,
) {
  const links = items.flatMap((item) =>
    item.files.map((file) => ({
      ...file,
      itemId: item.id,
    })),
  );
  const fileAssetIds = Array.from(
    new Set(links.map((file) => file.fileAssetId)),
  );
  const filesByItemId = new Map<string, CustomerUploadPublicFile[]>();

  if (!fileAssetIds.length) return filesByItemId;

  const fileAssets = await prisma.fileAsset.findMany({
    where: { id: { in: fileAssetIds } },
    select: {
      id: true,
      mimeType: true,
      originalName: true,
      sizeBytes: true,
    },
  });
  const fileAssetById = new Map(
    fileAssets.map((fileAsset) => [fileAsset.id, fileAsset]),
  );

  for (const link of links) {
    const fileAsset = fileAssetById.get(link.fileAssetId);

    if (!fileAsset) continue;

    const files = filesByItemId.get(link.itemId) ?? [];

    files.push({
      id: fileAsset.id,
      mimeType: fileAsset.mimeType,
      name: fileAsset.originalName,
      receivedAt: link.createdAt.toISOString(),
      sizeBytes: fileAsset.sizeBytes,
    });

    filesByItemId.set(link.itemId, files);
  }

  return filesByItemId;
}
