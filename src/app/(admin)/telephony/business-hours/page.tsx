import type { Metadata } from "next";
import PhoneSystemPage from "@/components/crm-boilerplate/telephony-pages/PhoneSystemPage";

export const metadata: Metadata = {
  title: "Telephony Business Hours | iD30 CRM",
};

export default function TelephonyBusinessHoursPage() {
  return <PhoneSystemPage activeTab="business-hours" />;
}
