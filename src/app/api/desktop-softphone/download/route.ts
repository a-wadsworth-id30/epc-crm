import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  allowDesktopSoftphoneGitHubReleaseDownloads,
  defaultDesktopSoftphoneMacDownloadUrl,
  desktopSoftphonePublicDownloadUrls,
  desktopSoftphoneVersion,
} from "@/lib/desktop-softphone/downloads";

const releaseTag =
  process.env.ID30_SOFTPHONE_RELEASE_TAG ??
  `desktop-softphone-v${desktopSoftphoneVersion}`;
const releaseBaseUrl = `https://github.com/davemof/iD30-CRM/releases/download/${releaseTag}`;

const defaultDownloadUrls = {
  mac: `${releaseBaseUrl}/iD30%20Softphone-darwin-arm64-${desktopSoftphoneVersion}.zip`,
  windows: `${releaseBaseUrl}/iD30%20Softphone-${desktopSoftphoneVersion}%20Setup.exe`,
};
const publicDownloadUrls = desktopSoftphonePublicDownloadUrls();
const allowGitHubReleaseDownloads =
  allowDesktopSoftphoneGitHubReleaseDownloads();

function downloadUrl(platform: string | null) {
  if (platform === "mac") {
    return (
      process.env.ID30_SOFTPHONE_MAC_DOWNLOAD_URL ??
      publicDownloadUrls?.mac ??
      defaultDesktopSoftphoneMacDownloadUrl
    );
  }

  if (platform === "windows") {
    return (
      process.env.ID30_SOFTPHONE_WINDOWS_DOWNLOAD_URL ??
      publicDownloadUrls?.windows ??
      (allowGitHubReleaseDownloads ? defaultDownloadUrls.windows : null)
    );
  }

  return null;
}

function redirectToDownload(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform");
  const url = downloadUrl(platform);

  if (!url) {
    return NextResponse.json(
      { error: "Desktop softphone download URL is not configured." },
      { status: platform === "mac" || platform === "windows" ? 503 : 400 },
    );
  }

  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");

  return response;
}

export async function GET(request: NextRequest) {
  await requireUser();

  return redirectToDownload(request);
}

export async function HEAD(request: NextRequest) {
  await requireUser();

  return redirectToDownload(request);
}
