import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import CustomerDocumentPortal from "@/components/crm-boilerplate/CustomerDocumentPortal";
import {
  customerDocumentPortalState,
  customerDocumentPortalTokenHash,
} from "@/lib/customer-document-portals";
import { customerDocumentShareState } from "@/lib/customer-document-shares";
import { customerUploadRequestState } from "@/lib/customer-upload-requests";
import { customerUploadEffectiveMaxUploadMb } from "@/lib/customer-upload-multipart-config";
import { customerUploadPublicFilesByItemId } from "@/lib/customer-upload-public-files";
import { prisma } from "@/lib/prisma";
import { cloudflareR2Provider, r2StoredConfigSchema } from "@/lib/storage/r2";

type CustomerDocumentPortalPageProps = {
  params: Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Document portal",
};

function unavailablePortalMessage(reason: "expired" | "not_found" | "revoked") {
  if (reason === "expired") {
    return "This secure document portal has expired. Reply to the email you received and we can issue a new link if anything is still needed.";
  }

  if (reason === "revoked") {
    return "This secure document portal has been closed by the team. Please ask for a new link if you still need access.";
  }

  return "This secure document portal could not be found. Please check the link or reply to the email you received so we can help.";
}

function UnavailablePortalLink({
  reason = "not_found",
}: {
  reason?: "expired" | "not_found" | "revoked";
}) {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800 dark:bg-gray-950 dark:text-white/90">
      <section className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Document portal unavailable
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {unavailablePortalMessage(reason)}
        </p>
      </section>
    </main>
  );
}

export default async function CustomerDocumentPortalPage({
  params,
}: CustomerDocumentPortalPageProps) {
  const { token } = await params;
  const [portal, r2Integration] = await Promise.all([
    prisma.customerDocumentPortal.findUnique({
      where: { tokenHash: customerDocumentPortalTokenHash(token) },
      select: {
        documentShare: {
          select: {
            expiresAt: true,
            files: {
              orderBy: { createdAt: "asc" },
              select: {
                displayName: true,
                fileAsset: {
                  select: {
                    id: true,
                    mimeType: true,
                    originalName: true,
                    sizeBytes: true,
                  },
                },
              },
            },
            revokedAt: true,
            status: true,
          },
        },
        entityId: true,
        entityType: true,
        expiresAt: true,
        message: true,
        recipientEmail: true,
        recipientName: true,
        revokedAt: true,
        status: true,
        uploadRequest: {
          select: {
            completedAt: true,
            expiresAt: true,
            items: {
              orderBy: { createdAt: "asc" },
              select: {
                _count: { select: { files: true } },
                description: true,
                files: {
                  orderBy: { createdAt: "asc" },
                  select: {
                    createdAt: true,
                    fileAssetId: true,
                  },
                },
                fulfilledAt: true,
                id: true,
                label: true,
              },
            },
            revokedAt: true,
            status: true,
          },
        },
      },
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: cloudflareR2Provider },
      select: { config: true },
    }),
  ]);

  if (!portal) {
    return <UnavailablePortalLink />;
  }

  const portalState = customerDocumentPortalState({
    expiresAt: portal.expiresAt,
    revokedAt: portal.revokedAt,
    status: portal.status,
  });

  if (portalState !== "open") {
    return <UnavailablePortalLink reason={portalState} />;
  }

  const uploadState = portal.uploadRequest
    ? customerUploadRequestState({
        completedAt: portal.uploadRequest.completedAt,
        expiresAt: portal.uploadRequest.expiresAt,
        revokedAt: portal.uploadRequest.revokedAt,
        status: portal.uploadRequest.status,
      })
    : null;
  const shareState = portal.documentShare
    ? customerDocumentShareState({
        expiresAt: portal.documentShare.expiresAt,
        revokedAt: portal.documentShare.revokedAt,
        status: portal.documentShare.status,
      })
    : null;
  const signatureRequests = portal.recipientEmail
    ? await prisma.signatureRequest.findMany({
        where: {
          entityId: portal.entityId,
          entityType: portal.entityType,
          recipients: { some: { email: portal.recipientEmail } },
        } satisfies Prisma.SignatureRequestWhereInput,
        orderBy: { createdAt: "desc" },
        select: {
          certificateFileAsset: {
            select: { originalName: true },
          },
          certificateFileAssetId: true,
          completedAt: true,
          declinedAt: true,
          deliveredAt: true,
          id: true,
          recipients: {
            orderBy: { routingOrder: "asc" },
            select: {
              email: true,
              name: true,
              status: true,
            },
          },
          sentAt: true,
          signedFileAsset: {
            select: { originalName: true },
          },
          signedFileAssetId: true,
          status: true,
          subject: true,
        },
        take: 20,
      })
    : [];
  const r2Config = r2StoredConfigSchema.safeParse(r2Integration?.config ?? {});
  const uploadPolicy = {
    allowedMimeTypes: r2Config.success ? r2Config.data.allowedMimeTypes : "",
    isConfigured: Boolean(r2Config.success && r2Config.data.credentials),
    maxUploadMb: customerUploadEffectiveMaxUploadMb(
      r2Config.success ? r2Config.data.maxUploadMb : null,
    ),
  };
  const filesByUploadItemId = portal.uploadRequest
    ? await customerUploadPublicFilesByItemId(portal.uploadRequest.items)
    : new Map();
  const checkedAt = new Date();
  const uploadCanRemoveFiles = Boolean(
    portal.uploadRequest &&
      portal.uploadRequest.status !== "REVOKED" &&
      !portal.uploadRequest.revokedAt &&
      portal.uploadRequest.expiresAt.getTime() > checkedAt.getTime(),
  );

  return (
    <CustomerDocumentPortal
      expiresAt={portal.expiresAt.toISOString()}
      isOpen={portalState === "open"}
      message={portal.message}
      recipientName={portal.recipientName}
      sharedFiles={
        shareState === "open"
          ? (portal.documentShare?.files.map((file) => ({
              fileAssetId: file.fileAsset.id,
              mimeType: file.fileAsset.mimeType,
              name: file.displayName ?? file.fileAsset.originalName,
              sizeBytes: file.fileAsset.sizeBytes,
            })) ?? [])
          : []
      }
      signatureRequests={signatureRequests.map((request) => ({
        certificateFileAssetId: request.certificateFileAssetId,
        certificateName: request.certificateFileAsset?.originalName ?? null,
        completedAt: request.completedAt?.toISOString() ?? null,
        declinedAt: request.declinedAt?.toISOString() ?? null,
        deliveredAt: request.deliveredAt?.toISOString() ?? null,
        id: request.id,
        recipients: request.recipients.map((recipient) => ({
          email: recipient.email,
          name: recipient.name,
          status: recipient.status,
        })),
        sentAt: request.sentAt?.toISOString() ?? null,
        signedFileAssetId: request.signedFileAssetId,
        signedFileName: request.signedFileAsset?.originalName ?? null,
        status: request.status,
        subject: request.subject,
      }))}
      token={token}
      uploadCanRemoveFiles={uploadCanRemoveFiles}
      uploadIsOpen={uploadState === "open"}
      uploadItems={
        portal.uploadRequest?.items.map((item) => ({
          description: item.description,
          fileCount: item._count.files,
          files: filesByUploadItemId.get(item.id) ?? [],
          fulfilledAt: item.fulfilledAt?.toISOString() ?? null,
          id: item.id,
          label: item.label,
        })) ?? []
      }
      uploadPolicy={uploadPolicy}
    />
  );
}
