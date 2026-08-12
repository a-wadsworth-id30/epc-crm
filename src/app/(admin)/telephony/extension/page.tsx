import { redirect } from "next/navigation";

export const metadata = {
  title: "Browser Extension | CRM",
};

export default function TelephonyChromeExtensionPage() {
  redirect("/settings/browser-extension");
}
