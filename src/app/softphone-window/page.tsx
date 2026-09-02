import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SoftphoneProvider from "@/components/crm-boilerplate/SoftphoneProvider";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Softphone | iD30 CRM",
};

export default async function SoftphoneWindowPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/signin?next=/softphone-window");
  }

  if (!currentUser.browserSoftphoneEnabled) {
    redirect("/");
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html,
            body {
              background: transparent !important;
              overflow: hidden;
            }

            [data-desktop-window-drag-handle] {
              -webkit-app-region: drag;
            }

            a,
            button,
            input,
            select,
            textarea,
            [data-desktop-no-drag] {
              -webkit-app-region: no-drag;
            }
          `,
        }}
      />
      <SoftphoneProvider currentUserId={currentUser.id} mode="standalone">
        {null}
      </SoftphoneProvider>
    </>
  );
}
