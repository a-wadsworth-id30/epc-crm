import LazyDesktopSoftphoneSettingsPanel from "@/components/crm-boilerplate/LazyDesktopSoftphoneSettingsPanel";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireUser } from "@/lib/auth";
import { desktopSoftphoneDownloadAvailability } from "@/lib/desktop-softphone/downloads";

export const metadata = {
  title: "Desktop Softphone | CRM",
};

export default async function BrowserExtensionSettingsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Desktop Softphone"
        description="Download the desktop softphone app for macOS or Windows."
      />
      <LazyDesktopSoftphoneSettingsPanel
        downloads={desktopSoftphoneDownloadAvailability()}
      />
    </>
  );
}
