import LazyCalendar from "@/components/calendar/LazyCalendar";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Calendar | iD30 CRM",
  description: "Schedule view for CRM follow-up and operational events.",
};

export default function CalendarPage() {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Schedule view for CRM follow-up and operational events."
      />
      <LazyCalendar />
    </>
  );
}
