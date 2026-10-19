"use client";

import { Eye, EyeOff, GripVertical, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  resetRoleDashboardLayoutAction,
  saveRoleDashboardLayoutAction,
} from "@/lib/actions/dashboard-layout";
import {
  defaultDashboardLayout,
  dashboardWidgetDefinition,
  type DashboardLayoutItem,
  type DashboardWidgetId,
  type DashboardWidgetSize,
} from "@/lib/dashboard/layout";
import type { UserRoleTemplateKey } from "@/lib/users/role-templates";

type RoleOption = {
  description: string;
  key: UserRoleTemplateKey;
  label: string;
};

function moveItem(layout: DashboardLayoutItem[], from: number, to: number) {
  if (from === to || to < 0 || to >= layout.length) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  if (!item) return layout;
  next.splice(to, 0, item);
  return next;
}

export default function RoleDashboardEditor({
  initialLayouts,
  roles,
}: {
  initialLayouts: Record<UserRoleTemplateKey, DashboardLayoutItem[]>;
  roles: RoleOption[];
}) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] =
    useState<UserRoleTemplateKey>("owner");
  const [layouts, setLayouts] = useState(initialLayouts);
  const [draggedId, setDraggedId] = useState<DashboardWidgetId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const layout = layouts[selectedRole];
  const selectedRoleDefinition = useMemo(
    () => roles.find((role) => role.key === selectedRole)!,
    [roles, selectedRole],
  );

  function setLayout(next: DashboardLayoutItem[]) {
    setLayouts((current) => ({ ...current, [selectedRole]: next }));
  }

  function updateItem(
    id: DashboardWidgetId,
    update: Partial<DashboardLayoutItem>,
  ) {
    setLayout(
      layout.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  function save() {
    startTransition(async () => {
      const result = await saveRoleDashboardLayoutAction(selectedRole, layout);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetRoleDashboardLayoutAction(selectedRole);
      setMessage(result.message);
      if (result.ok) {
        setLayout(defaultDashboardLayout(selectedRole));
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="px-2 pb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
          Role defaults
        </p>
        <div className="space-y-1">
          {roles.map((role) => (
            <button
              key={role.key}
              type="button"
              onClick={() => {
                setSelectedRole(role.key);
                setMessage(null);
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                selectedRole === role.key
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>
      </aside>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white/90">
              {selectedRoleDefinition.label} dashboard
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {selectedRoleDefinition.description}
            </p>
            {message ? (
              <p className="mt-2 text-sm font-medium text-brand-600">
                {message}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
            >
              <RotateCcw className="h-4 w-4" />
              System default
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isPending ? "Saving…" : "Save role layout"}
            </button>
          </div>
        </div>

        <div className="space-y-2 p-4">
          {layout.map((item, index) => {
            const definition = dashboardWidgetDefinition(item.id);
            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDraggedId(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggedId) return;
                  const from = layout.findIndex(
                    (entry) => entry.id === draggedId,
                  );
                  setLayout(moveItem(layout, from, index));
                  setDraggedId(null);
                }}
                className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-3 ${
                  item.visible
                    ? "border-gray-200 dark:border-gray-800"
                    : "border-dashed border-gray-200 opacity-60 dark:border-gray-800"
                }`}
              >
                <GripVertical className="h-4 w-4 cursor-grab text-gray-400" />
                <span className="min-w-[180px] flex-1 text-sm font-semibold text-gray-800 dark:text-white/90">
                  {definition.label}
                </span>
                <button
                  type="button"
                  aria-label={`Move ${definition.label} earlier`}
                  disabled={index === 0}
                  onClick={() => setLayout(moveItem(layout, index, index - 1))}
                  className="rounded px-2 py-1 text-xs font-semibold disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label={`Move ${definition.label} later`}
                  disabled={index === layout.length - 1}
                  onClick={() => setLayout(moveItem(layout, index, index + 1))}
                  className="rounded px-2 py-1 text-xs font-semibold disabled:opacity-30"
                >
                  →
                </button>
                <select
                  aria-label={`${definition.label} size`}
                  value={item.size}
                  onChange={(event) =>
                    updateItem(item.id, {
                      size: event.target.value as DashboardWidgetSize,
                    })
                  }
                  className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                >
                  {definition.sizes.map((size) => (
                    <option key={size} value={size}>
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    updateItem(item.id, { visible: !item.visible })
                  }
                  className="inline-flex h-9 min-w-[90px] items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 text-sm font-semibold dark:border-gray-700"
                >
                  {item.visible ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                  {item.visible ? "Shown" : "Hidden"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
