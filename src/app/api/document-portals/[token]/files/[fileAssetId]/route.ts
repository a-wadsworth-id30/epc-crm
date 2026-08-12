import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  customerDocumentPortalState,
  customerDocumentPortalTokenHash,
} from "@/lib/customer-document-portals";
import { customerDocumentShareState } from "@/lib/customer-document-shares";
import { prisma } from "@/lib/prisma";
import { createR2DownloadUrl } from "@/lib/storage/r2";

type CustomerDocumentPortalDownloadContext = {
  params: Promise<{ fileAssetId: string; token: string }>;
};

function notFoundResponse() {
  return NextResponse.json({ message: "Document not found." }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: CustomerDocumentPortalDownloadContext,
) {
  const { fileAssetId, token } = await context.params;
  const portal = await prisma.customerDocumentPortal.findUnique({
    where: { tokenHash: customerDocumentPortalTokenHash(token) },
    select: {
      documentShare: {
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
      },
      entityId: true,
      entityType: true,
      expiresAt: true,
      id: true,
      recipientEmail: true,
      revokedAt: true,
      status: true,
    },
  });

  if (!portal) {
    return notFoundResponse();
  }

  const portalState = customerDocumentPortalState({
    expiresAt: portal.expiresAt,
    revokedAt: portal.revokedAt,
    status: portal.status,
  });

  if (portalState !== "open") {
    return NextResponse.json(
      { message: "This document portal is no longer open." },
      { status: 410 },
    );
  }

  const shareState = portal.documentShare
    ? customerDocumentShareState({
        expiresAt: portal.documentShare.expiresAt,
        revokedAt: portal.documentShare.revokedAt,
        status: portal.documentShare.status,
      })
    : null;
  const shareFile =
    shareState === "open" ? portal.documentShare?.files[0] : null;

  if (
    shareFile &&
    shareFile.fileAsset.entityId === portal.entityId &&
    shareFile.fileAsset.entityType === portal.entityType
  ) {
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
          action: "customer_document_portal.downloaded",
          actorId: null,
          entity: "CustomerDocumentPortal",
          entityId: portal.id,
          metadata: {
            documentShareId: portal.documentShare?.id ?? null,
            entityId: portal.entityId,
            entityType: portal.entityType,
            fileAssetId: shareFile.fileAsset.id,
            fileName: shareFile.fileAsset.originalName,
            source: "document-share",
          },
        },
      }),
    ]);

    return NextResponse.redirect(downloadUrl, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const signatureWhere: Prisma.SignatureRequestWhereInput = {
    entityId: portal.entityId,
    entityType: portal.entityType,
    status: "COMPLETED",
    OR: [
      { signedFileAssetId: fileAssetId },
      { certificateFileAssetId: fileAssetId },
    ],
  };

  if (portal.recipientEmail) {
    signatureWhere.recipients = { some: { email: portal.recipientEmail } };
  }

  const signatureRequest = await prisma.signatureRequest.findFirst({
    where: signatureWhere,
    select: {
      certificateFileAsset: {
        select: {
          id: true,
          key: true,
          originalName: true,
        },
      },
      certificateFileAssetId: true,
      id: true,
      signedFileAsset: {
        select: {
          id: true,
          key: true,
          originalName: true,
        },
      },
      signedFileAssetId: true,
    },
  });

  if (!signatureRequest) {
    return notFoundResponse();
  }

  const signatureFile =
    signatureRequest.signedFileAssetId === fileAssetId
      ? signatureRequest.signedFileAsset
      : signatureRequest.certificateFileAsset;

  if (!signatureFile) {
    return notFoundResponse();
  }

  const downloadUrl = await createR2DownloadUrl({
    expiresIn: 300,
    key: signatureFile.key,
  });

  await prisma.auditLog.create({
    data: {
      action: "customer_document_portal.downloaded",
      actorId: null,
      entity: "CustomerDocumentPortal",
      entityId: portal.id,
      metadata: {
        entityId: portal.entityId,
        entityType: portal.entityType,
        fileAssetId: signatureFile.id,
        fileName: signatureFile.originalName,
        signatureRequestId: signatureRequest.id,
        source: "signature-request",
      },
    },
  });

  return NextResponse.redirect(downloadUrl, {
    headers: { "Cache-Control": "no-store" },
  });
}
