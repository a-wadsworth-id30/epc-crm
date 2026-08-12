import type { Metadata } from "next";
import PhoneSystemPage from "@/components/crm-boilerplate/telephony-pages/PhoneSystemPage";

export const metadata: Metadata = {
  title: "Telephony Numbers | iD30 CRM",
};

export default function TelephonyNumbersPage() {
  return <PhoneSystemPage activeTab="business-numbers" />;
}
