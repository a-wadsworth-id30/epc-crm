"use client";

import dynamic from "next/dynamic";

function CalendarLoading() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="h-6 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
      <div className="mt-5 grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, index) => (
          <div
            key={index}
            className="aspect-square rounded-lg bg-gray-50 dark:bg-white/[0.05]"
          />
        ))}
      </div>
    </div>
  );
}

const Calendar = dynamic(() => import("@/components/calendar/Calendar"), {
  loading: CalendarLoading,
  ssr: false,
});

export default function LazyCalendar() {
  return <Calendar />;
}
