import type { Metadata } from "next";
import PhoneSystemPage from "@/components/crm-boilerplate/telephony-pages/PhoneSystemPage";

export const metadata: Metadata = {
  title: "Telephony Monitoring | iD30 CRM",
};

export default function TelephonyLivePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PhoneSystemPage activeTab="live-monitoring" searchParams={searchParams} />;
}
