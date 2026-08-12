import LazyDesktopSoftphoneSettingsPanel from "@/components/crm-boilerplate/LazyDesktopSoftphoneSettingsPanel";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireUser } from "@/lib/auth";
import {
  allowDesktopSoftphoneGitHubReleaseDownloads,
  defaultDesktopSoftphoneMacDownloadUrl,
  desktopSoftphonePublicDownloadBaseUrl,
} from "@/lib/desktop-softphone/downloads";

export const metadata = {
  title: "Desktop Softphone | CRM",
};

export default async function BrowserExtensionSettingsPage() {
  await requireUser();
  const allowGitHubReleaseDownloads =
    allowDesktopSoftphoneGitHubReleaseDownloads();
  const hasDownloadBaseUrl = Boolean(desktopSoftphonePublicDownloadBaseUrl());

  return (
    <>
      <PageHeader
        title="Desktop Softphone"
        description="Download the desktop softphone app for macOS or Windows."
      />
      <LazyDesktopSoftphoneSettingsPanel
        downloads={{
          mac:
            Boolean(process.env.ID30_SOFTPHONE_MAC_DOWNLOAD_URL) ||
            hasDownloadBaseUrl ||
            Boolean(defaultDesktopSoftphoneMacDownloadUrl) ||
            allowGitHubReleaseDownloads,
          windows:
            Boolean(process.env.ID30_SOFTPHONE_WINDOWS_DOWNLOAD_URL) ||
            hasDownloadBaseUrl ||
            allowGitHubReleaseDownloads,
        }}
      />
    </>
  );
}
