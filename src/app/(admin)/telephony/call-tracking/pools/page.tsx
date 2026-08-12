import type { Metadata } from "next";
import CallTrackingInventoryPage from "@/components/crm-boilerplate/telephony-pages/CallTrackingInventoryPage";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Call Tracking Pools | iD30 CRM",
};

export default async function TelephonyCallTrackingPoolsPage() {
  await requireAdmin();

  return <CallTrackingInventoryPage mode="pools" />;
}
