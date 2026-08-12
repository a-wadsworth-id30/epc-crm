import type { Metadata } from "next";
import PhoneSystemPage from "@/components/crm-boilerplate/telephony-pages/PhoneSystemPage";

export const metadata: Metadata = {
  title: "Telephony | iD30 CRM",
};

export default function TelephonyPage() {
  return <PhoneSystemPage activeTab="dashboard" />;
}
