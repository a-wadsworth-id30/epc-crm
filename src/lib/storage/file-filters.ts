import type { Prisma } from "@prisma/client";

export const documentMimeTypes = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export function documentFileAssetWhere(): Prisma.FileAssetWhereInput {
  return {
    OR: [
      { mimeType: "application/pdf" },
      { mimeType: { startsWith: "text/" } },
      { mimeType: { in: documentMimeTypes } },
    ],
  };
}
