import type { Metadata } from "next";
import PhoneSystemPage from "@/components/crm-boilerplate/telephony-pages/PhoneSystemPage";

export const metadata: Metadata = {
  title: "Telephony System | iD30 CRM",
};

export default function TelephonySystemPage() {
  return <PhoneSystemPage activeTab="settings" />;
}
