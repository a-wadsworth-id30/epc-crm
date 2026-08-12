"use client";

import { useEffect, useState } from "react";

type ExtensionStatus = {
  active: boolean;
  lastSeenAt: number | null;
  version?: string;
};

const heartbeatTimeoutMs = 12_000;

export default function ChromeExtensionInstallStatus() {
  const [status, setStatus] = useState<ExtensionStatus>({
    active: false,
    lastSeenAt: null,
  });

  useEffect(() => {
    function markActive(payload?: { version?: string }) {
      setStatus({
        active: true,
        lastSeenAt: Date.now(),
        version: payload?.version,
      });
    }

    function announcePageReady() {
      window.postMessage(
        {
          source: "id30-crm-page",
          type: "PAGE_READY",
          payload: { requestedAt: new Date().toISOString() },
        },
        window.location.origin,
      );
    }

    function handleReadyEvent(
      event: CustomEvent<{ version?: string }>,
    ) {
      markActive(event.detail);
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as {
        source?: string;
        type?: string;
        payload?: { version?: string };
      };

      if (data?.source !== "id30-crm-extension") {
        return;
      }

      if (data.type === "READY" || data.type === "HEARTBEAT") {
        markActive(data.payload);
      }
    }

    window.addEventListener("message", handleMessage);
    window.addEventListener(
      "id30:softphone-extension-ready",
      handleReadyEvent as EventListener,
    );
    announcePageReady();

    const announceInterval = window.setInterval(announcePageReady, 4000);
    const expiryInterval = window.setInterval(() => {
      setStatus((current) => {
        if (
          !current.active ||
          !current.lastSeenAt ||
          Date.now() - current.lastSeenAt <= heartbeatTimeoutMs
        ) {
          return current;
        }

        return {
          ...current,
          active: false,
        };
      });
    }, 2000);

    return () => {
      window.clearInterval(announceInterval);
      window.clearInterval(expiryInterval);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener(
        "id30:softphone-extension-ready",
        handleReadyEvent as EventListener,
      );
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {status.active ? "Extension detected" : "Extension not detected"}
            </p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {status.active
                ? "Chrome is sending the softphone heartbeat. Use the extension icon to open or focus the browser-level softphone window."
                : "Install or enable the extension, then open the softphone window from the Chrome toolbar."}
            </p>
          </div>
          <span
            className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
              status.active ? "bg-success-500" : "bg-gray-300 dark:bg-gray-700"
            }`}
          />
        </div>
      </div>

      <div className="grid gap-3">
        <StatusLine
          label="Status"
          value={status.active ? "Connected" : "Waiting"}
        />
        <StatusLine
          label="Version"
          value={status.version ?? "Not detected"}
        />
        <StatusLine
          label="Last heartbeat"
          value={
            status.lastSeenAt
              ? new Intl.DateTimeFormat("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date(status.lastSeenAt))
              : "Never"
          }
        />
      </div>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
      <span className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <span className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
        {value}
      </span>
    </div>
  );
}
