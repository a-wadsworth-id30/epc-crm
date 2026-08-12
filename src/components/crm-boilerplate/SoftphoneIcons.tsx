"use client";

import type { ReactNode } from "react";

type SoftphoneIconProps = {
  className?: string;
};

function IconBase({
  children,
  className,
}: SoftphoneIconProps & {
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function PhoneIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.09 9.88a16 16 0 0 0 6 6l1.25-1.25a2 2 0 0 1 2.11-.45c.9.32 1.84.55 2.8.68A2 2 0 0 1 22 16.92Z" />
    </IconBase>
  );
}

export function PhoneOffIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M10.68 13.31a16 16 0 0 0 2.01 2.01" />
      <path d="M16.38 16.38 15.34 17.42a2 2 0 0 1-2.11.45 19.8 19.8 0 0 1-8.04-5.02A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.08.6.2 1.19.36 1.76" />
      <path d="M22 16.92v3a2 2 0 0 1-.59 1.42" />
      <path d="M2 2 22 22" />
    </IconBase>
  );
}

export function MicIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v4" />
      <path d="M8 22h8" />
    </IconBase>
  );
}

export function MicOffIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M9 9v2a3 3 0 0 0 5.12 2.12" />
      <path d="M15 9.34V6a3 3 0 0 0-5.68-1.33" />
      <path d="M19 11a7 7 0 0 1-9.8 6.4" />
      <path d="M5 11a7 7 0 0 0 7 7" />
      <path d="M12 18v4" />
      <path d="M8 22h8" />
      <path d="M2 2 22 22" />
    </IconBase>
  );
}

export function XIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconBase>
  );
}

export function ChevronRightIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="m9 18 6-6-6-6" />
    </IconBase>
  );
}

export function PauseIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </IconBase>
  );
}

export function TransferIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15 21 21" />
    </IconBase>
  );
}

export function HistoryIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  );
}

export function SettingsIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.07 14H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.07V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.37 9c.3.61.92 1 1.6 1H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </IconBase>
  );
}

export function UsersIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconBase>
  );
}

export function KeypadIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M7 6h.01" />
      <path d="M12 6h.01" />
      <path d="M17 6h.01" />
      <path d="M7 12h.01" />
      <path d="M12 12h.01" />
      <path d="M17 12h.01" />
      <path d="M7 18h.01" />
      <path d="M12 18h.01" />
      <path d="M17 18h.01" />
    </IconBase>
  );
}

export function GripIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M9 5h.01" />
      <path d="M15 5h.01" />
      <path d="M9 12h.01" />
      <path d="M15 12h.01" />
      <path d="M9 19h.01" />
      <path d="M15 19h.01" />
    </IconBase>
  );
}

export function ExternalLinkIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </IconBase>
  );
}

export function NoteIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M8 6h8" />
      <path d="M8 10h8" />
      <path d="M8 14h4" />
      <path d="M5 3h14v18H5z" />
    </IconBase>
  );
}

export function AlertTriangleIcon({ className }: SoftphoneIconProps) {
  return (
    <IconBase className={className}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}
