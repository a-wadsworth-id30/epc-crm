import type { Metadata } from "next";
import PhoneSystemPage from "@/components/crm-boilerplate/telephony-pages/PhoneSystemPage";

export const metadata: Metadata = {
  title: "Telephony Users | iD30 CRM",
};

export default function TelephonyUsersPage() {
  return <PhoneSystemPage activeTab="agents" />;
}
