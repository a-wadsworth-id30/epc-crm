"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BuildVersionResponse = {
  build?: {
    shortCommit?: string;
  };
};

type DeployVersionGuardProps = {
  currentCommit: string;
  pollIntervalMs?: number;
};

const chunkErrorPatterns = [
  "chunkloaderror",
  "loading chunk",
  "failed to fetch dynamically imported module",
  "failed to load module script",
  "importing a module script failed",
  "_next/static",
];

function isKnownCommit(value: string | null | undefined) {
  return Boolean(value && value !== "unknown");
}

function isDeployAssetError(error: unknown) {
  let message = "";

  if (error instanceof Error) {
    message = `${error.name} ${error.message}`;
  } else if (typeof error === "string") {
    message = error;
  } else {
    try {
      message = JSON.stringify(error ?? "");
    } catch {
      message = "";
    }
  }

  const normalized = message.toLowerCase();
  return chunkErrorPatterns.some((pattern) => normalized.includes(pattern));
}

function assetUrlFromTarget(target: EventTarget | null) {
  if (target instanceof HTMLScriptElement) return target.src;
  if (target instanceof HTMLLinkElement) return target.href;
  return "";
}

export default function DeployVersionGuard({
  currentCommit,
  pollIntervalMs = 300_000,
}: DeployVersionGuardProps) {
  const initialCommitRef = useRef(
    isKnownCommit(currentCommit) ? currentCommit.slice(0, 7) : currentCommit,
  );
  const [latestCommit, setLatestCommit] = useState<string | null>(null);
  const [availableBuild, setAvailableBuild] = useState<
    BuildVersionResponse["build"] | null
  >(null);
  const [assetErrorDetected, setAssetErrorDetected] = useState(false);
  const [dismissedCommit, setDismissedCommit] = useState<string | null>(null);

  const checkBuild = useCallback(async () => {
    const response = await fetch("/api/build-version", {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) return;

    const data = (await response.json()) as BuildVersionResponse;
    const nextCommit = data.build?.shortCommit;
    setLatestCommit(isKnownCommit(nextCommit) ? (nextCommit ?? null) : null);

    if (
      isKnownCommit(nextCommit) &&
      isKnownCommit(initialCommitRef.current) &&
      nextCommit !== initialCommitRef.current
    ) {
      setAvailableBuild(data.build ?? null);
    }
  }, []);

  useEffect(() => {
    const runCheck = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void checkBuild().catch(() => undefined);
    };

    const firstCheck = window.setTimeout(runCheck, 1_000);
    const timer = window.setInterval(() => {
      runCheck();
    }, pollIntervalMs);

    const checkWhenVisible = () => runCheck();

    window.addEventListener("focus", checkWhenVisible);
    window.addEventListener("online", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(timer);
      window.removeEventListener("focus", checkWhenVisible);
      window.removeEventListener("online", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [checkBuild, pollIntervalMs]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const assetUrl = assetUrlFromTarget(event.target);

      const errorPayload = [event.error, event.message, assetUrl]
        .filter(Boolean)
        .join(" ");

      if (!isDeployAssetError(errorPayload)) return;
      setAssetErrorDetected(true);
      void checkBuild().catch(() => undefined);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isDeployAssetError(event.reason)) return;
      setAssetErrorDetected(true);
      void checkBuild().catch(() => undefined);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, [checkBuild]);

  const visibleCommit = availableBuild?.shortCommit ?? latestCommit;
  const shouldShow =
    (Boolean(availableBuild) || assetErrorDetected) &&
    (!visibleCommit || dismissedCommit !== visibleCommit);

  if (!shouldShow) return null;

  const refreshPage = () => {
    window.location.reload();
  };

  return (
    <div
      className="fixed right-4 bottom-4 z-999999 w-[calc(100%-2rem)] max-w-md rounded-xl border border-brand-200 bg-white p-4 shadow-theme-lg dark:border-brand-900/50 dark:bg-gray-950"
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white/90">
            New CRM version available
          </p>
          <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-400">
            Refresh to load the latest navigation and page files.
          </p>
          {availableBuild?.shortCommit ? (
            <p className="mt-2 text-xs font-medium text-gray-400 dark:text-gray-500">
              Build {availableBuild.shortCommit}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-gray-500 transition hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
            onClick={() => setDismissedCommit(visibleCommit ?? "asset-error")}
          >
            Later
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600"
            onClick={refreshPage}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
