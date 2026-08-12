"use client";

import { UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type FileDropzoneProps = {
  accept?: string;
  disabled?: boolean;
  id: string;
  inputName?: string;
  maxUploadMb: number;
  multiple?: boolean;
  onSelectionChange: (fileNames: string[]) => void;
  resetSignal?: number;
  selectedFileNames: string[];
  title: string;
};

function fileNames(files: FileList | null) {
  return Array.from(files ?? []).map((file) => file.name);
}

function firstFileOnly(files: FileList) {
  if (files.length <= 1) return files;

  const transfer = new DataTransfer();
  transfer.items.add(files[0]);
  return transfer.files;
}

function acceptedTypeSummary(accept?: string) {
  const values = accept
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!values?.length) return "common file types";

  const labels = new Set<string>();

  values.forEach((value) => {
    if (value === "image/*" || value.startsWith("image/")) {
      labels.add("images");
      return;
    }

    if (value === "application/pdf" || value.includes("pdf")) {
      labels.add("PDFs");
      return;
    }

    if (value.includes("word") || value.includes("document")) {
      labels.add("Word documents");
      return;
    }

    if (value.includes("spreadsheet") || value.includes("excel")) {
      labels.add("spreadsheets");
      return;
    }

    if (value.startsWith("text/")) {
      labels.add("text files");
      return;
    }

    labels.add(value.replace(/^application\//, ""));
  });

  return Array.from(labels).slice(0, 4).join(", ");
}

export default function FileDropzone({
  accept,
  disabled = false,
  id,
  inputName = "files",
  maxUploadMb,
  multiple = true,
  onSelectionChange,
  resetSignal = 0,
  selectedFileNames,
  title,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const displayNames = selectedFileNames.slice(0, 3);
  const overflowCount = Math.max(
    0,
    selectedFileNames.length - displayNames.length,
  );
  const acceptedTypes = acceptedTypeSummary(accept);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [resetSignal]);

  return (
    <label
      htmlFor={id}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (disabled || !inputRef.current) return;

        const files = multiple
          ? event.dataTransfer.files
          : firstFileOnly(event.dataTransfer.files);
        inputRef.current.files = files;
        onSelectionChange(fileNames(files));
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition ${
        isDragging
          ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300"
          : "border-gray-300 bg-gray-50 text-gray-700 hover:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-500"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <UploadCloud className="h-5 w-5 text-brand-500" />
      <span className="mt-2 max-w-full text-sm font-semibold text-gray-800 dark:text-white/90">
        {displayNames.length ? displayNames.join(", ") : title}
        {overflowCount ? ` +${overflowCount} more` : ""}
      </span>
      <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Drag and drop or browse · {multiple ? "multiple files" : "one file"} ·{" "}
        {acceptedTypes} · up to {maxUploadMb}MB each
      </span>
      <input
        ref={inputRef}
        id={id}
        name={inputName}
        type="file"
        accept={accept || undefined}
        multiple={multiple}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => onSelectionChange(fileNames(event.target.files))}
      />
    </label>
  );
}
