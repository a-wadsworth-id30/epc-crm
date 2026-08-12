import type { Metadata } from "next";
import CallTrackingPage from "@/components/crm-boilerplate/telephony-pages/CallTrackingPage";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Call Tracking Overview | iD30 CRM",
};

export default async function TelephonyCallTrackingOverviewPage() {
  await requireAdmin();

  return <CallTrackingPage />;
}
