"use client";

import { useEffect, useMemo, useState } from "react";
import { DownloadIcon } from "@/icons";

type Platform = "mac" | "windows" | "unknown";

const downloadOptions = {
  mac: {
    label: "macOS",
    detail: "Apple Silicon Mac app",
    filename: "iD30-Softphone-macOS-arm64.zip",
    href: "/api/desktop-softphone/download?platform=mac",
  },
  windows: {
    label: "Windows",
    detail: "Windows 10/11 installer",
    filename: "iD30-Softphone-Windows-x64.exe",
    href: "/api/desktop-softphone/download?platform=windows",
  },
};
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";

  const navigatorWithUaData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const source = [
    navigatorWithUaData.userAgentData?.platform,
    navigator.platform,
    navigator.userAgent,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (source.includes("win")) return "windows";
  if (source.includes("mac")) return "mac";

  return "unknown";
}

export default function DesktopSoftphoneSettingsPanel({
  downloads,
}: DesktopSoftphoneSettingsPanelProps) {
  const [detectedPlatform, setDetectedPlatform] =
    useState<Platform>("unknown");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDetectedPlatform(detectPlatform());
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const recommendedPlatform = useMemo(
    () => (detectedPlatform === "windows" ? "windows" : "mac"),
    [detectedPlatform],
  );
  const recommended = downloadOptions[recommendedPlatform];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">
                  Recommended download
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  iD30 Desktop Softphone for {recommended.label}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                  The desktop app keeps the floating softphone available outside
                  the CRM tab and opens CRM records in the default browser.
                </p>
              </div>
              <span className="inline-flex rounded-full bg-success-50 px-3 py-1 text-sm font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300">
                {detectedPlatform === "unknown"
                  ? "Choose platform"
                  : `${recommended.label} detected`}
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={recommended.href}
                download={recommended.filename}
                aria-disabled={!downloads[recommendedPlatform]}
                onClick={(event) => {
                  if (!downloads[recommendedPlatform]) event.preventDefault();
                }}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold shadow-theme-xs transition ${
                  downloads[recommendedPlatform]
                    ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
                    : "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500"
                }`}
              >
                <DownloadIcon className="h-4 w-4" />
                {downloads[recommendedPlatform]
                  ? `Download for ${recommended.label}`
                  : `${recommended.label} download not configured`}
              </a>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {recommended.detail}
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <InstallerPoint
                title="Floating phone"
                detail="Same softphone controls as the CRM overlay."
              />
              <InstallerPoint
                title="Browser links"
                detail="Customer and sale links open in your browser."
              />
              <InstallerPoint
                title="App updates"
                detail="Desktop releases can update from the app channel."
              />
            </div>
          </div>

          <div className="border-t border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.02] lg:border-l lg:border-t-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Other downloads
            </p>
            <div className="mt-4 grid gap-3">
              <DownloadCard
                configured={downloads.mac}
                platform="mac"
                detectedPlatform={detectedPlatform}
              />
              <DownloadCard
                configured={downloads.windows}
                platform="windows"
                detectedPlatform={detectedPlatform}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-4 md:grid-cols-3">
          <SetupStep
            number="1"
            title="Download"
            detail="Use the recommended installer for this computer."
          />
          <SetupStep
            number="2"
            title="Install"
            detail="On Mac, unzip the app and move it to Applications. On Windows, run the installer."
          />
          <SetupStep
            number="3"
            title="Sign in"
            detail="Launch iD30 Softphone and sign in with your CRM account."
          />
        </div>
      </section>
    </div>
  );
}

export type DesktopSoftphoneSettingsPanelProps = {
  downloads: Record<"mac" | "windows", boolean>;
};

function DownloadCard({
  detectedPlatform,
  configured,
  platform,
}: {
  detectedPlatform: Platform;
  configured: boolean;
  platform: "mac" | "windows";
}) {
  const option = downloadOptions[platform];
  const isDetected = detectedPlatform === platform;

  return (
    <a
      href={option.href}
      download={option.filename}
      aria-disabled={!configured}
      onClick={(event) => {
        if (!configured) event.preventDefault();
      }}
      className={`group flex items-center justify-between gap-3 rounded-xl border p-4 shadow-theme-xs transition ${
        configured
          ? "border-gray-200 bg-white hover:border-brand-200 hover:bg-brand-50/40 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40"
          : "cursor-not-allowed border-gray-200 bg-gray-50 opacity-70 dark:border-gray-800 dark:bg-white/[0.02]"
      }`}
    >
      <span>
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
          {option.label}
          {isDetected && (
            <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300">
              Detected
            </span>
          )}
        </span>
        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
          {configured ? option.detail : "Download URL not configured"}
        </span>
      </span>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-500 transition group-hover:border-brand-200 group-hover:text-brand-600 dark:border-gray-800 dark:text-gray-400">
        <DownloadIcon className="h-4 w-4" />
      </span>
    </a>
  );
}

function InstallerPoint({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
        {title}
      </p>
      <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
        {detail}
      </p>
    </div>
  );
}

function SetupStep({
  detail,
  number,
  title,
}: {
  detail: string;
  number: string;
  title: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-900 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
        {number}
      </span>
      <span>
        <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
          {title}
        </span>
        <span className="mt-1 block text-sm leading-5 text-gray-500 dark:text-gray-400">
          {detail}
        </span>
      </span>
    </div>
  );
}
