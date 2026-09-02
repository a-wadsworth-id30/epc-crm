export const desktopSoftphoneVersion = "0.1.28";

export const defaultDesktopSoftphoneDownloadBaseUrl =
  "https://pub-dd0c50b7d886446ea973dd80b6ea38f6.r2.dev";

export const defaultDesktopSoftphoneMacDownloadUrl =
  `${defaultDesktopSoftphoneDownloadBaseUrl}/latest/iD30-Softphone-macOS-arm64.zip`;

export const defaultDesktopSoftphoneWindowsDownloadUrl =
  `${defaultDesktopSoftphoneDownloadBaseUrl}/latest/iD30-Softphone-Windows-x64.exe`;

export const defaultDesktopSoftphoneMacFilename =
  "iD30-Softphone-macOS-arm64.zip";

export const defaultDesktopSoftphoneWindowsFilename =
  "iD30-Softphone-Windows-x64.exe";

export type DesktopSoftphonePlatform = "mac" | "windows";

function desktopSoftphoneReleaseTag() {
  return (
    process.env.ID30_SOFTPHONE_RELEASE_TAG ??
    `desktop-softphone-v${desktopSoftphoneVersion}`
  );
}

function desktopSoftphoneGitHubReleaseDownloadUrls() {
  const releaseBaseUrl = `https://github.com/a-wadsworth-id30/epc-crm/releases/download/${desktopSoftphoneReleaseTag()}`;

  return {
    mac: `${releaseBaseUrl}/iD30%20Softphone-darwin-arm64-${desktopSoftphoneVersion}.zip`,
    windows: `${releaseBaseUrl}/iD30%20Softphone-${desktopSoftphoneVersion}%20Setup.exe`,
  };
}

export function desktopSoftphonePublicDownloadBaseUrl() {
  return process.env.ID30_SOFTPHONE_DOWNLOAD_BASE_URL?.replace(/\/$/, "");
}

export function desktopSoftphonePublicDownloadUrls() {
  const baseUrl = desktopSoftphonePublicDownloadBaseUrl();

  if (!baseUrl) return null;

  return {
    mac: `${baseUrl}/latest/iD30-Softphone-macOS-arm64.zip`,
    windows: `${baseUrl}/latest/iD30-Softphone-Windows-x64.exe`,
  };
}

export function allowDesktopSoftphoneGitHubReleaseDownloads() {
  return process.env.ID30_SOFTPHONE_ALLOW_GITHUB_RELEASE_DOWNLOADS === "true";
}

export function desktopSoftphoneDownloadUrl(
  platform: string | null | undefined,
) {
  const publicDownloadUrls = desktopSoftphonePublicDownloadUrls();
  const githubReleaseDownloadUrls = desktopSoftphoneGitHubReleaseDownloadUrls();
  const allowGitHubReleaseDownloads =
    allowDesktopSoftphoneGitHubReleaseDownloads();

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
      (allowGitHubReleaseDownloads
        ? githubReleaseDownloadUrls.windows
        : defaultDesktopSoftphoneWindowsDownloadUrl)
    );
  }

  return null;
}

export function desktopSoftphoneDownloadFilename(
  platform: string | null | undefined,
) {
  if (platform === "mac") return defaultDesktopSoftphoneMacFilename;
  if (platform === "windows") return defaultDesktopSoftphoneWindowsFilename;

  return null;
}

export function desktopSoftphoneDownloadAvailability(): Record<
  DesktopSoftphonePlatform,
  boolean
> {
  return {
    mac: Boolean(desktopSoftphoneDownloadUrl("mac")),
    windows: Boolean(desktopSoftphoneDownloadUrl("windows")),
  };
}
