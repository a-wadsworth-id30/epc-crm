"use client";

import dynamic from "next/dynamic";
import type { UserTableRow } from "@/components/crm-boilerplate/UsersTable";

function UsersTableLoading() {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="h-10 w-full max-w-sm rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[820px] divide-y divide-gray-100 dark:divide-gray-800">
          <div className="grid grid-cols-[1.4fr_1.3fr_0.8fr_1fr_0.8fr_0.8fr] gap-4 bg-gray-50 px-5 py-3 dark:bg-white/[0.02]">
            {["User", "Role", "Status", "Setup", "Phone", "Created"].map(
              (item) => (
                <div key={item} className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]">
                  <span className="sr-only">{item}</span>
                </div>
              ),
            )}
          </div>
          {["one", "two", "three", "four"].map((item) => (
            <div
              key={item}
              className="grid grid-cols-[1.4fr_1.3fr_0.8fr_1fr_0.8fr_0.8fr] gap-4 px-5 py-4"
            >
              <div>
                <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-3 w-56 rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="h-10 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              <div>
                <div className="h-6 w-24 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="mt-2 h-3 w-32 rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="h-4 w-20 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-24 rounded bg-gray-50 dark:bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const UsersTable = dynamic(
  () => import("@/components/crm-boilerplate/UsersTable"),
  {
    loading: UsersTableLoading,
    ssr: false,
  },
);

export default function LazyUsersTable({ users }: { users: UserTableRow[] }) {
  return <UsersTable users={users} />;
}
