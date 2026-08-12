export const desktopSoftphoneVersion = "0.1.18";

export const defaultDesktopSoftphoneDownloadBaseUrl =
  "https://pub-dd0c50b7d886446ea973dd80b6ea38f6.r2.dev";

export const defaultDesktopSoftphoneMacDownloadUrl =
  `${defaultDesktopSoftphoneDownloadBaseUrl}/latest/iD30-Softphone-macOS-arm64.zip`;

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
