import type { ReactNode } from "react";
import { formatDateTime, formatRelativeDate } from "@/lib/formatters/date";

export type AuditLogTableEvent = {
  action: string;
  actor?: {
    email: string | null;
    name: string | null;
  } | null;
  createdAt: Date | string;
  entity: string;
  entityId?: string | null;
  id: string;
};

export default function AuditLogTable({
  className = "",
  emptyMessage = "No audit records found yet.",
  events,
}: {
  className?: string;
  emptyMessage?: ReactNode;
  events: AuditLogTableEvent[];
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-white/[0.02]">
          <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            <th className="px-5 py-3">Event</th>
            <th className="px-5 py-3">Actor</th>
            <th className="px-5 py-3">Entity</th>
            <th className="px-5 py-3">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {events.map((event) => (
            <tr key={event.id} className="text-sm text-gray-700 dark:text-gray-300">
              <td className="px-5 py-4 font-medium text-gray-800 dark:text-white/90">
                {event.action}
              </td>
              <td className="px-5 py-4">
                <div>{event.actor?.name ?? "System"}</div>
                {event.actor?.email ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {event.actor.email}
                  </div>
                ) : null}
              </td>
              <td className="px-5 py-4">
                <div>{event.entity}</div>
                {event.entityId ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {event.entityId}
                  </div>
                ) : null}
              </td>
              <td className="px-5 py-4">
                <div>{formatRelativeDate(event.createdAt)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDateTime(event.createdAt)}
                </div>
              </td>
            </tr>
          ))}
          {!events.length ? (
            <tr>
              <td
                colSpan={4}
                className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
