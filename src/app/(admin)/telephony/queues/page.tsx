import type { Metadata } from "next";
import PhoneSystemPage from "@/components/crm-boilerplate/telephony-pages/PhoneSystemPage";

export const metadata: Metadata = {
  title: "Telephony Teams | iD30 CRM",
};

export default function TelephonyQueuesPage() {
  return <PhoneSystemPage activeTab="call-groups" />;
}
