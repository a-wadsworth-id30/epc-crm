"use client";

import {
  ChangeEvent,
  DragEvent,
  MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { UploadIcon } from "@/icons";

export default function ImageUploadDropzone({
  id,
  name,
  previewUrl,
  fallback,
  title = "Image upload",
  description = "Drag and drop an image here or browse.",
  disabled = false,
  onFileAccepted,
}: {
  id: string;
  name: string;
  previewUrl?: string | null;
  fallback?: string;
  title?: string;
  description?: string;
  disabled?: boolean;
  onFileAccepted?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(
    null,
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState("");
  const displayPreviewUrl = selectedPreviewUrl ?? previewUrl;

  useEffect(() => {
    return () => {
      if (selectedPreviewUrl) {
        URL.revokeObjectURL(selectedPreviewUrl);
      }
    };
  }, [selectedPreviewUrl]);

  function acceptFile(file: File, syncNativeInput: boolean) {
    if (!file.type.startsWith("image/")) {
      setError("Use an image file.");
      return;
    }

    if (syncNativeInput && inputRef.current) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
    }

    setError("");
    setSelectedPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }

      return URL.createObjectURL(file);
    });
    onFileAccepted?.(file);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      acceptFile(file, false);
    }
  }

  function handleRootClick(event: MouseEvent<HTMLDivElement>) {
    if (disabled || event.target === inputRef.current) {
      return;
    }

    inputRef.current?.click();
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!disabled) {
      setIsDragActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);

    if (disabled) {
      return;
    }

    const file = event.dataTransfer.files[0];

    if (file) {
      acceptFile(file, true);
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handleRootClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border border-dashed p-2.5 transition sm:flex-row sm:items-center ${
        isDragActive
          ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
          : "border-gray-300 bg-gray-50 hover:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500"
      } ${error ? "border-error-500 bg-error-50 dark:bg-error-500/10" : ""} ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        onChange={handleInputChange}
      />
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white bg-cover bg-center text-sm font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10"
        style={
          displayPreviewUrl
            ? { backgroundImage: `url(${displayPreviewUrl})` }
            : undefined
        }
        aria-label={`${title} preview`}
      >
        {!displayPreviewUrl &&
          (fallback ? (
            fallback
          ) : (
            <UploadIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          ))}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-800 dark:text-white/90">
          {isDragActive ? "Drop image to upload" : title}
        </p>
        <p className="mt-0.5 text-xs leading-4 text-gray-500 dark:text-gray-400">
          {error || description}
        </p>
        <span className="mt-0.5 inline-flex text-xs font-medium text-brand-600 dark:text-brand-400">
          Browse image
        </span>
      </div>
    </div>
  );
}
