import type { Metadata } from "next";
import PhoneSystemPage from "@/components/crm-boilerplate/telephony-pages/PhoneSystemPage";

export const metadata: Metadata = {
  title: "Call Recordings | iD30 CRM",
};

export default function TelephonyRecordingsPage() {
  return <PhoneSystemPage activeTab="recordings" />;
}
