import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import CustomerUploadPortal from "@/components/crm-boilerplate/CustomerUploadPortal";
import { getCustomerUploadBranding } from "@/lib/customer-upload-branding";
import {
  customerUploadRequestState,
  customerUploadTokenHash,
} from "@/lib/customer-upload-requests";
import { customerUploadEffectiveMaxUploadMb } from "@/lib/customer-upload-multipart-config";
import { customerUploadPublicFilesByItemId } from "@/lib/customer-upload-public-files";
import { prisma } from "@/lib/prisma";
import { cloudflareR2Provider, r2StoredConfigSchema } from "@/lib/storage/r2";

type CustomerUploadPageProps = {
  params: Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Secure document upload",
};

function UnavailableUploadLink({
  branding,
}: {
  branding: {
    logoUrl: string;
    name: string;
  };
}) {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800 dark:bg-gray-950 dark:text-white/90">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding.logoUrl}
              alt={`${branding.name} logo`}
              className="h-14 max-w-[220px] object-contain"
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-success-200 bg-success-50 px-3 py-1 text-xs font-semibold text-success-700 shadow-theme-xs dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure upload request from {branding.name}
            </span>
          </div>
        </div>
        <section className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Upload link unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            This document upload link has expired, been completed, been revoked
            or could not be found. Reply to the email you received and we can
            send a new link if anything is still needed.
          </p>
        </section>
      </div>
    </main>
  );
}

export default async function CustomerUploadPage({
  params,
}: CustomerUploadPageProps) {
  const { token } = await params;
  const [branding, request, r2Integration] = await Promise.all([
    getCustomerUploadBranding(),
    prisma.customerUploadRequest.findUnique({
      where: { tokenHash: customerUploadTokenHash(token) },
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
        message: true,
        recipientName: true,
        revokedAt: true,
        status: true,
      },
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: cloudflareR2Provider },
      select: { config: true },
    }),
  ]);

  if (!request) {
    return <UnavailableUploadLink branding={branding} />;
  }

  const r2Config = r2StoredConfigSchema.safeParse(r2Integration?.config ?? {});
  const state = customerUploadRequestState({
    completedAt: request.completedAt,
    expiresAt: request.expiresAt,
    revokedAt: request.revokedAt,
    status: request.status,
  });
  const uploadPolicy = {
    allowedMimeTypes: r2Config.success ? r2Config.data.allowedMimeTypes : "",
    isConfigured: Boolean(r2Config.success && r2Config.data.credentials),
    maxUploadMb: customerUploadEffectiveMaxUploadMb(
      r2Config.success ? r2Config.data.maxUploadMb : null,
    ),
  };
  const filesByItemId = await customerUploadPublicFilesByItemId(request.items);
  const checkedAt = new Date();
  const canRemoveFiles =
    request.status !== "REVOKED" &&
    !request.revokedAt &&
    request.expiresAt.getTime() > checkedAt.getTime();

  return (
    <CustomerUploadPortal
      branding={branding}
      canRemoveFiles={canRemoveFiles}
      expiresAt={request.expiresAt.toISOString()}
      isOpen={state === "open"}
      items={request.items.map((item) => ({
        description: item.description,
        fileCount: item._count.files,
        files: filesByItemId.get(item.id) ?? [],
        fulfilledAt: item.fulfilledAt?.toISOString() ?? null,
        id: item.id,
        label: item.label,
      }))}
      message={request.message}
      recipientName={request.recipientName}
      token={token}
      uploadPolicy={uploadPolicy}
      uploadState={state}
    />
  );
}
