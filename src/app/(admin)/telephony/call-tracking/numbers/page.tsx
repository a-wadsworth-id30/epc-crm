import type { Metadata } from "next";
import CallTrackingInventoryPage from "@/components/crm-boilerplate/telephony-pages/CallTrackingInventoryPage";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Tracking Numbers | iD30 CRM",
};

export default async function TelephonyCallTrackingNumbersPage() {
  await requireAdmin();

  return <CallTrackingInventoryPage mode="numbers" />;
}
