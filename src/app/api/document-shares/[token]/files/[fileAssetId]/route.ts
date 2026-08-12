import { NextResponse } from "next/server";
import {
  customerDocumentShareState,
  customerDocumentShareTokenHash,
} from "@/lib/customer-document-shares";
import { prisma } from "@/lib/prisma";
import { createR2DownloadUrl } from "@/lib/storage/r2";

type CustomerDocumentShareDownloadContext = {
  params: Promise<{ fileAssetId: string; token: string }>;
};

export async function GET(
  _request: Request,
  context: CustomerDocumentShareDownloadContext,
) {
  const { fileAssetId, token } = await context.params;
  const share = await prisma.customerDocumentShare.findUnique({
    where: { tokenHash: customerDocumentShareTokenHash(token) },
    select: {
      entityId: true,
      entityType: true,
      expiresAt: true,
      files: {
        take: 1,
        where: { fileAssetId },
        select: {
          fileAsset: {
            select: {
              entityId: true,
              entityType: true,
              id: true,
              key: true,
              originalName: true,
            },
          },
          firstDownloadedAt: true,
          id: true,
        },
      },
      id: true,
      revokedAt: true,
      status: true,
    },
  });

  if (!share) {
    return NextResponse.json(
      { message: "Document not found." },
      { status: 404 },
    );
  }

  const state = customerDocumentShareState({
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    status: share.status,
  });

  if (state !== "open") {
    return NextResponse.json(
      { message: "This document share link is no longer open." },
      { status: 410 },
    );
  }

  const shareFile = share.files[0];

  if (!shareFile) {
    return NextResponse.json(
      { message: "Document not found." },
      { status: 404 },
    );
  }

  if (
    shareFile.fileAsset.entityId !== share.entityId ||
    shareFile.fileAsset.entityType !== share.entityType
  ) {
    return NextResponse.json(
      { message: "Document not found." },
      { status: 404 },
    );
  }

  const downloadUrl = await createR2DownloadUrl({
    expiresIn: 300,
    key: shareFile.fileAsset.key,
  });
  const downloadedAt = new Date();

  await prisma.$transaction([
    prisma.customerDocumentShareFile.update({
      where: { id: shareFile.id },
      data: {
        downloadCount: { increment: 1 },
        firstDownloadedAt: shareFile.firstDownloadedAt ?? downloadedAt,
        lastDownloadedAt: downloadedAt,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "customer_document_share.downloaded",
        actorId: null,
        entity: "CustomerDocumentShare",
        entityId: share.id,
        metadata: {
          entityId: share.entityId,
          entityType: share.entityType,
          fileAssetId: shareFile.fileAsset.id,
          fileName: shareFile.fileAsset.originalName,
        },
      },
    }),
  ]);

  return NextResponse.redirect(downloadUrl, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
