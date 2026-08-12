import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";
import { CustomerLinkGuidance } from "@/components/crm-boilerplate/CustomerLinkGuidance";
import {
  customerDocumentShareState,
  customerDocumentShareTokenHash,
} from "@/lib/customer-document-shares";
import { prisma } from "@/lib/prisma";

type CustomerDocumentSharePageProps = {
  params: Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Shared documents",
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(value);
}

function fileTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("text/")) return "Text file";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return "Spreadsheet";
  }
  if (mimeType.includes("word") || mimeType.includes("document")) {
    return "Document";
  }

  return "File";
}

function unavailableShareMessage(reason: "expired" | "not_found" | "revoked") {
  if (reason === "expired") {
    return "This secure document link has expired. Reply to the email you received and we can send a new link if you still need access.";
  }

  if (reason === "revoked") {
    return "This secure document link has been closed by the team. Please ask for a new link if you still need access.";
  }

  return "This secure document link could not be found. Please check the link or reply to the email you received so we can help.";
}

function UnavailableShareLink({
  reason = "not_found",
}: {
  reason?: "expired" | "not_found" | "revoked";
}) {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800 dark:bg-gray-950 dark:text-white/90">
      <section className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Shared documents unavailable
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {unavailableShareMessage(reason)}
        </p>
      </section>
    </main>
  );
}

export default async function CustomerDocumentSharePage({
  params,
}: CustomerDocumentSharePageProps) {
  const { token } = await params;
  const share = await prisma.customerDocumentShare.findUnique({
    where: { tokenHash: customerDocumentShareTokenHash(token) },
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
      message: true,
      recipientName: true,
      revokedAt: true,
      status: true,
      subject: true,
    },
  });

  if (!share) {
    return <UnavailableShareLink />;
  }

  const state = customerDocumentShareState({
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    status: share.status,
  });

  if (state !== "open") {
    return <UnavailableShareLink reason={state} />;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800 dark:bg-gray-950 dark:text-white/90">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col items-start gap-3 border-b border-gray-100 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
            <div>
              <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">
                iD30 CRM
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {share.subject}
              </h1>
              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {share.recipientName ? `Hi ${share.recipientName}, ` : ""}
                these documents have been shared securely for you to review or
                download.
              </p>
            </div>
            <span className="inline-flex h-8 items-center rounded-full bg-success-50 px-3 text-xs font-semibold text-success-700 ring-1 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40">
              Expires {formatDateTime(share.expiresAt)}
            </span>
          </div>

          {share.message ? (
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-300">
              {share.message}
            </div>
          ) : null}
        </section>

        <CustomerLinkGuidance
          summary="Use this secure page to download only the documents listed below."
          steps={[
            "Review the list of files shared with you.",
            "Select Download next to each file you want to open or save.",
            "If anything looks wrong or a file will not open, reply to the email you received and we will help.",
          ]}
          note={`This private link only gives access to the files listed here. Download access ends on ${formatDateTime(share.expiresAt)}, or earlier if the link is closed by the team.`}
        />

        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <Download className="h-4 w-4 text-brand-500" />
            Documents available to download
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Download these files to review, keep for your records or share with
            anyone helping you respond.
          </p>
          <div className="mt-4 space-y-3">
            {share.files.map((file) => {
              const documentName =
                file.displayName ?? file.fileAsset.originalName;

              return (
                <a
                  key={file.fileAsset.id}
                  href={`/api/document-shares/${encodeURIComponent(token)}/files/${encodeURIComponent(file.fileAsset.id)}`}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-gray-800 dark:bg-gray-950/30 dark:hover:border-brand-900/50 dark:hover:bg-brand-900/10"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-gray-900 dark:text-white">
                      {documentName}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      {fileTypeLabel(file.fileAsset.mimeType)} ·{" "}
                      {formatBytes(file.fileAsset.sizeBytes)}
                    </span>
                  </span>
                  <span className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-brand-100 bg-brand-50 px-3 text-xs font-semibold text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300">
                    <Download className="h-4 w-4" />
                    Download
                  </span>
                </a>
              );
            })}
          </div>

          <p className="mt-5 text-xs leading-5 text-gray-500 dark:text-gray-400">
            This link is private. It only gives access to the files listed
            above.
          </p>
        </section>
      </div>
    </main>
  );
}
