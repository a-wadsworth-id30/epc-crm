"use client";

import { Download, Eye, FileText, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";

export type PreviewFile = {
  createdAt?: string;
  mimeType: string;
  name: string;
  notes?: string | null;
  sizeLabel?: string;
  tags?: string[];
  uploadedBy?: string | null;
  previewUrl?: string;
  url: string;
};

function normalizedMimeType(mimeType: string) {
  return mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
}

function looksLikePdf(fileName: string) {
  return fileName.toLowerCase().endsWith(".pdf");
}

function looksLikeText(fileName: string) {
  return /\.(csv|json|log|md|txt)$/i.test(fileName);
}

export function isPreviewableMimeType(mimeType: string, fileName = "") {
  const normalized = normalizedMimeType(mimeType);

  return (
    normalized.startsWith("image/") ||
    normalized === "application/pdf" ||
    normalized === "application/json" ||
    normalized.startsWith("text/") ||
    looksLikePdf(fileName) ||
    looksLikeText(fileName)
  );
}

function previewKind(file: PreviewFile) {
  const normalized = normalizedMimeType(file.mimeType);

  if (normalized.startsWith("image/")) return "image";
  if (
    normalized === "application/pdf" ||
    normalized === "application/json" ||
    normalized.startsWith("text/") ||
    looksLikePdf(file.name) ||
    looksLikeText(file.name)
  ) {
    return "frame";
  }
  return "none";
}

function previewUrl(file: PreviewFile) {
  if (file.previewUrl) return file.previewUrl;

  const match = file.url.match(/^(\/api\/media\/[^/?#]+)([?#].*)?$/);

  if (match) {
    return `${match[1]}/preview${match[2] ?? ""}`;
  }

  return file.url;
}

export default function FilePreviewButton({
  className = "",
  file,
}: {
  className?: string;
  file: PreviewFile;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const kind = previewKind(file);
  const assetPreviewUrl = previewUrl(file);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={className}
        aria-label={`Preview ${file.name}`}
      >
        {isPreviewableMimeType(file.mimeType, file.name) ? (
          <Eye className="h-4 w-4" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        showCloseButton={false}
        className="relative m-5 w-full max-w-[980px] rounded-3xl bg-white p-5 sm:m-0 lg:p-6 dark:bg-gray-900"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-gray-800 dark:text-white/90">
                {file.name}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {[file.mimeType, file.sizeLabel, file.createdAt, file.uploadedBy]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <Download className="h-4 w-4" />
                Open file
              </a>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {kind === "image" ? (
            <div className="relative h-[70vh] overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
              <Image
                src={assetPreviewUrl}
                alt={file.name}
                fill
                sizes="90vw"
                className="object-contain"
                unoptimized
              />
            </div>
          ) : null}

          {kind === "frame" ? (
            <iframe
              src={assetPreviewUrl}
              title={file.name}
              className="h-[70vh] w-full rounded-xl border border-gray-200 bg-white dark:border-gray-800"
            />
          ) : null}

          {kind === "none" ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center dark:border-gray-800">
              <FileText className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-white/90">
                Preview is not available for this file type.
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Open the file to view it in a compatible app.
              </p>
            </div>
          ) : null}

          {file.tags?.length || file.notes ? (
            <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
              {file.tags?.length ? (
                <div className="flex flex-wrap gap-2">
                  {file.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {file.notes ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {file.notes}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
