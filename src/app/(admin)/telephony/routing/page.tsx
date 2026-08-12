import type { Metadata } from "next";
import PhoneSystemPage from "@/components/crm-boilerplate/telephony-pages/PhoneSystemPage";

export const metadata: Metadata = {
  title: "Telephony Routing | iD30 CRM",
};

export default function TelephonyRoutingPage() {
  return <PhoneSystemPage activeTab="routing-ivr" />;
}
