"use client";

import {
  Download,
  ExternalLink,
  FileText,
  Paperclip,
  Save,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  type EmailAttachmentDisplay,
  visibleEmailAttachments,
} from "@/lib/email/attachment-display";

function formatFileSize(sizeBytes: number | null) {
  if (sizeBytes === null || sizeBytes < 0) return null;
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

export default function EmailAttachmentGallery({
  attachments,
}: {
  attachments: EmailAttachmentDisplay[];
}) {
  const { showToast } = useToast();
  const [currentAttachments, setCurrentAttachments] = useState(attachments);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => setCurrentAttachments(attachments), [attachments]);

  const visibleAttachments = visibleEmailAttachments(currentAttachments);
  if (!visibleAttachments.length) return null;

  const images = visibleAttachments.filter(
    (attachment) => attachment.isImage && attachment.previewUrl,
  );

  async function saveToCrm(attachment: EmailAttachmentDisplay) {
    setSavingId(attachment.id);

    try {
      const response = await fetch(
        `/api/email-attachments/${encodeURIComponent(attachment.id)}`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        attachment?: EmailAttachmentDisplay;
        message?: string;
      };
      if (!response.ok || !payload.attachment) {
        throw new Error(
          payload.message || "The attachment could not be saved to the CRM.",
        );
      }

      setCurrentAttachments((current) =>
        current.map((item) =>
          item.id === payload.attachment?.id ? payload.attachment : item,
        ),
      );
      showToast("Attachment saved to CRM storage.");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "The attachment could not be saved to the CRM.",
        "error",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function downloadFromGmail(attachment: EmailAttachmentDisplay) {
    if (!attachment.downloadUrl) return;
    setDownloadingId(attachment.id);

    try {
      const response = await fetch(attachment.downloadUrl);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          payload.message || "The attachment could not be downloaded.",
        );
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "The attachment could not be downloaded.",
        "error",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        <Paperclip className="h-4 w-4" />
        {visibleAttachments.length} attachment
        {visibleAttachments.length === 1 ? "" : "s"}
      </div>

      {images.length ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {images.map((attachment) => (
            <a
              key={`image-${attachment.id}`}
              className="group overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
              href={attachment.previewUrl ?? undefined}
              rel="noreferrer"
              target="_blank"
            >
              <div className="relative flex min-h-32 items-center justify-center bg-white p-2 dark:bg-gray-950">
                <Image
                  unoptimized
                  alt={attachment.name}
                  className="h-auto max-h-64 w-auto max-w-full object-contain"
                  height={320}
                  src={attachment.previewUrl ?? ""}
                  width={640}
                />
              </div>
              <p className="truncate border-t border-gray-100 px-3 py-2 text-xs font-medium text-gray-700 group-hover:text-brand-600 dark:border-gray-800 dark:text-gray-300 dark:group-hover:text-brand-400">
                {attachment.name}
              </p>
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {visibleAttachments.map((attachment) => {
          const size = formatFileSize(attachment.sizeBytes);

          return (
            <div
              key={attachment.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950"
            >
              <FileText className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium text-gray-800 dark:text-gray-200">
                  {attachment.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {[attachment.mimeType, size].filter(Boolean).join(" · ") ||
                    "Email attachment"}
                </p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  {attachment.storageLabel === "CRM"
                    ? "Saved to CRM"
                    : attachment.storageLabel === "Gmail"
                      ? "Stored in Gmail"
                      : "Provider file unavailable"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {attachment.canPreview && attachment.previewUrl ? (
                  <a
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                    href={attachment.previewUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Preview
                  </a>
                ) : null}
                {attachment.downloadUrl &&
                attachment.storageLabel === "Gmail" ? (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-brand-200 hover:text-brand-600 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                    disabled={downloadingId === attachment.id}
                    type="button"
                    onClick={() => void downloadFromGmail(attachment)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloadingId === attachment.id
                      ? "Downloading..."
                      : "Download"}
                  </button>
                ) : attachment.downloadUrl ? (
                  <a
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                    href={attachment.downloadUrl}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                ) : attachment.storageLabel === "Unavailable" ? (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Unavailable
                  </span>
                ) : null}
                {attachment.canSaveToCrm ? (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-brand-200 hover:text-brand-600 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                    disabled={savingId === attachment.id}
                    type="button"
                    onClick={() => void saveToCrm(attachment)}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {savingId === attachment.id ? "Saving..." : "Save to CRM"}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
