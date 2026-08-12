"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { offlineCampaignChannelLabels } from "@/lib/marketing/offline-campaigns";
import type { OfflineCampaignRow } from "@/components/crm-boilerplate/OfflineCampaignsPanel";

type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

const errorCorrectionOptions: Array<{
  label: string;
  value: ErrorCorrectionLevel;
}> = [
  { label: "Standard", value: "M" },
  { label: "High", value: "Q" },
  { label: "Maximum", value: "H" },
  { label: "Compact", value: "L" },
];
const pngSizes = [512, 1024, 2048] as const;
const qrMargins = [1, 2, 4] as const;
const defaultForeground = "#111827";
const defaultBackground = "#FFFFFF";

export default function OfflineCampaignQrTools({
  campaigns,
}: {
  campaigns: OfflineCampaignRow[];
}) {
  const { showToast } = useToast();
  const qrCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.destinationUrl),
    [campaigns],
  );
  const [selectedId, setSelectedId] = useState(qrCampaigns[0]?.id ?? "");
  const selectedCampaign =
    qrCampaigns.find((campaign) => campaign.id === selectedId) ?? qrCampaigns[0] ?? null;
  const targetUrl = selectedCampaign ? buildQrTargetUrl(selectedCampaign) : null;
  const [errorCorrectionLevel, setErrorCorrectionLevel] =
    useState<ErrorCorrectionLevel>("M");
  const [pngSize, setPngSize] = useState<(typeof pngSizes)[number]>(1024);
  const [margin, setMargin] = useState<(typeof qrMargins)[number]>(2);
  const [foregroundColor, setForegroundColor] = useState(defaultForeground);
  const [backgroundColor, setBackgroundColor] = useState(defaultBackground);
  const [qrSvg, setQrSvg] = useState("");

  useEffect(() => {
    let active = true;

    async function renderQr() {
      if (!targetUrl) {
        setQrSvg("");
        return;
      }

      const svg = await QRCode.toString(targetUrl, {
        type: "svg",
        errorCorrectionLevel,
        margin,
        width: 260,
        color: {
          dark: foregroundColor,
          light: backgroundColor,
        },
      });

      if (active) setQrSvg(svg);
    }

    renderQr().catch(() => {
      if (active) setQrSvg("");
    });

    return () => {
      active = false;
    };
  }, [backgroundColor, errorCorrectionLevel, foregroundColor, margin, targetUrl]);

  async function copyTargetUrl() {
    if (!targetUrl) return;
    await navigator.clipboard.writeText(targetUrl);
    showToast("QR URL copied.");
  }

  function downloadSvg() {
    if (!qrSvg || !selectedCampaign) return;
    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    downloadBlob(blob, `${selectedCampaign.code.toLowerCase()}-qr.svg`);
  }

  async function downloadPng() {
    if (!targetUrl || !selectedCampaign) return;
    const dataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel,
      margin,
      width: pngSize,
      color: {
        dark: foregroundColor,
        light: backgroundColor,
      },
    });
    downloadUrl(dataUrl, `${selectedCampaign.code.toLowerCase()}-qr.png`);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          QR campaign generator
        </h2>
      </div>

      {qrCampaigns.length ? (
        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex h-[260px] w-[260px] items-center justify-center rounded-lg bg-white p-3 shadow-theme-xs">
              {qrSvg ? (
                <div
                  className="h-[236px] w-[236px]"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <span className="text-sm text-gray-500">QR unavailable</span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Campaign
              </span>
              <select
                value={selectedCampaign?.id ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
              >
                {qrCampaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} / {campaign.code}
                  </option>
                ))}
              </select>
            </label>

            {selectedCampaign ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Fact label="Channel" value={offlineCampaignChannelLabels[selectedCampaign.channel]} />
                <Fact label="Source" value={selectedCampaign.source} />
                <Fact label="Medium" value={selectedCampaign.medium} />
                <Fact label="Campaign" value={selectedCampaign.campaign} />
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                QR URL
              </span>
              <textarea
                readOnly
                value={targetUrl ?? ""}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
              />
            </label>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Correction
                  </span>
                  <select
                    value={errorCorrectionLevel}
                    onChange={(event) =>
                      setErrorCorrectionLevel(event.target.value as ErrorCorrectionLevel)
                    }
                    className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
                  >
                    {errorCorrectionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    PNG size
                  </span>
                  <select
                    value={pngSize}
                    onChange={(event) =>
                      setPngSize(Number(event.target.value) as (typeof pngSizes)[number])
                    }
                    className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
                  >
                    {pngSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}px
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Margin
                  </span>
                  <select
                    value={margin}
                    onChange={(event) =>
                      setMargin(Number(event.target.value) as (typeof qrMargins)[number])
                    }
                    className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
                  >
                    {qrMargins.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <ColorPicker
                  label="Foreground"
                  value={foregroundColor}
                  onChange={setForegroundColor}
                />
                <ColorPicker
                  label="Background"
                  value={backgroundColor}
                  onChange={setBackgroundColor}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyTargetUrl}
                disabled={!targetUrl}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.06]"
              >
                Copy URL
              </button>
              <button
                type="button"
                onClick={downloadSvg}
                disabled={!qrSvg}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Download SVG
              </button>
              <button
                type="button"
                onClick={() => void downloadPng()}
                disabled={!targetUrl}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-500 px-4 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-500/10"
              >
                Download PNG
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
          Add a destination URL to an offline campaign to generate QR artwork.
        </p>
      )}
    </section>
  );
}

function ColorPicker({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>
      <span className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-2 dark:border-gray-700">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label={label}
        />
        <span className="truncate text-xs font-semibold text-gray-600 dark:text-gray-300">
          {value.toUpperCase()}
        </span>
      </span>
    </label>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function buildQrTargetUrl(campaign: OfflineCampaignRow) {
  if (!campaign.destinationUrl) return null;

  try {
    const url = new URL(campaign.destinationUrl);
    url.searchParams.set("utm_source", campaign.source);
    url.searchParams.set("utm_medium", campaign.medium);
    url.searchParams.set("utm_campaign", campaign.campaign);
    url.searchParams.set("id30_offline_code", campaign.code);

    if (campaign.content) url.searchParams.set("utm_content", campaign.content);
    if (campaign.term) url.searchParams.set("utm_term", campaign.term);

    return url.toString();
  } catch {
    return null;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  downloadUrl(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
