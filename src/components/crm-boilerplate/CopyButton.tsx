"use client";

import { useState } from "react";
import { AppIconButton } from "@/components/ui/action-icon/AppActionIcon";

export type CopyButtonProps = {
  className?: string;
  label?: string;
  value: string | null | undefined;
};

export default function CopyButton({
  className,
  label = "Copy",
  value,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const copyValue = value?.trim();

  async function copy() {
    if (!copyValue) return;

    await navigator.clipboard.writeText(copyValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <AppIconButton
      className={className}
      disabled={!copyValue}
      icon={copied ? "confirm" : "copy"}
      label={copied ? "Copied" : label}
      onClick={() => void copy()}
      size="xs"
      type="button"
      variant={copied ? "success" : "muted"}
    />
  );
}
