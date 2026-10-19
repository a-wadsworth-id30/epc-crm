"use client";

import {
  Eye,
  EyeOff,
  GripVertical,
  LayoutDashboard,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  resetMyDashboardLayoutAction,
  saveMyDashboardLayoutAction,
} from "@/lib/actions/dashboard-layout";
import {
  dashboardLayoutClassName,
  dashboardWidgetDefinition,
  type DashboardLayoutItem,
  type DashboardWidgetId,
  type DashboardWidgetSize,
} from "@/lib/dashboard/layout";

function moveItem(layout: DashboardLayoutItem[], from: number, to: number) {
  if (from === to || to < 0 || to >= layout.length) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  if (!item) return layout;
  next.splice(to, 0, item);
  return next;
}

type EditableDashboardContextValue = {
  draggedId: DashboardWidgetId | null;
  editing: boolean;
  layout: DashboardLayoutItem[];
  move: (from: number, to: number) => void;
  setDraggedId: (id: DashboardWidgetId | null) => void;
  updateItem: (
    id: DashboardWidgetId,
    update: Partial<DashboardLayoutItem>,
  ) => void;
};

const EditableDashboardContext =
  createContext<EditableDashboardContextValue | null>(null);

export default function EditableDashboard({
  hasPersonalLayout,
  initialLayout,
  roleLayout,
  children,
}: {
  children: ReactNode;
  hasPersonalLayout: boolean;
  initialLayout: DashboardLayoutItem[];
  roleLayout: DashboardLayoutItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(initialLayout);
  const [draggedId, setDraggedId] = useState<DashboardWidgetId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateItem(
    id: DashboardWidgetId,
    update: Partial<DashboardLayoutItem>,
  ) {
    setLayout((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  function save() {
    startTransition(async () => {
      const result = await saveMyDashboardLayoutAction(layout);
      setMessage(result.message);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetMyDashboardLayoutAction();
      setMessage(result.message);
      if (result.ok) {
        setLayout(roleLayout);
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {editing ? "Editing your dashboard" : "Your dashboard"}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {message ??
              (hasPersonalLayout
                ? "Using your personal layout."
                : "Using the default layout for your role.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={reset}
                disabled={isPending}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 shadow-theme-xs disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
              >
                <RotateCcw className="h-4 w-4" />
                Reset to role default
              </button>
              <button
                type="button"
                onClick={() => {
                  setLayout(initialLayout);
                  setEditing(false);
                  setMessage(null);
                }}
                disabled={isPending}
                className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 shadow-theme-xs disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white shadow-theme-xs disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save layout"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setEditing(true);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-theme-xs hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
            >
              <LayoutDashboard className="h-4 w-4" />
              Edit dashboard
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Drag widgets to reorder them, or use the arrow buttons. Hidden widgets
          remain available here until you save.
        </p>
      ) : null}

      <EditableDashboardContext.Provider
        value={{
          draggedId,
          editing,
          layout,
          move: (from, to) =>
            setLayout((current) => moveItem(current, from, to)),
          setDraggedId,
          updateItem,
        }}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12">
          {children}
        </div>
      </EditableDashboardContext.Provider>
    </div>
  );
}

export function DashboardWidget({
  children,
  id,
}: {
  children: ReactNode;
  id: DashboardWidgetId;
}) {
  const context = useContext(EditableDashboardContext);
  if (!context)
    throw new Error("DashboardWidget must be inside EditableDashboard.");
  const index = context.layout.findIndex((item) => item.id === id);
  const item = context.layout[index];
  if (!item || (!context.editing && !item.visible)) return null;
  const definition = dashboardWidgetDefinition(id);

  return (
    <div
      style={{ order: index }}
      draggable={context.editing}
      onDragStart={() => context.setDraggedId(id)}
      onDragOver={(event) => context.editing && event.preventDefault()}
      onDrop={() => {
        if (!context.draggedId) return;
        const from = context.layout.findIndex(
          (entry) => entry.id === context.draggedId,
        );
        context.move(from, index);
        context.setDraggedId(null);
      }}
      className={`${dashboardLayoutClassName(item.size)} min-w-0 ${context.editing && !item.visible ? "opacity-55" : ""}`}
    >
      {context.editing ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-brand-200 bg-brand-50/60 px-2 py-2 dark:border-brand-900/50 dark:bg-brand-900/10">
          <GripVertical className="h-4 w-4 cursor-grab text-gray-400" />
          <span className="mr-auto text-xs font-semibold text-gray-700 dark:text-gray-200">
            {definition.label}
          </span>
          <button
            type="button"
            aria-label={`Move ${definition.label} earlier`}
            disabled={index === 0}
            onClick={() => context.move(index, index - 1)}
            className="rounded px-2 py-1 text-xs font-semibold disabled:opacity-30"
          >
            ←
          </button>
          <button
            type="button"
            aria-label={`Move ${definition.label} later`}
            disabled={index === context.layout.length - 1}
            onClick={() => context.move(index, index + 1)}
            className="rounded px-2 py-1 text-xs font-semibold disabled:opacity-30"
          >
            →
          </button>
          <select
            aria-label={`${definition.label} size`}
            value={item.size}
            onChange={(event) =>
              context.updateItem(id, {
                size: event.target.value as DashboardWidgetSize,
              })
            }
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
          >
            {definition.sizes.map((size) => (
              <option key={size} value={size}>
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`${item.visible ? "Hide" : "Show"} ${definition.label}`}
            onClick={() => context.updateItem(id, { visible: !item.visible })}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold dark:border-gray-700 dark:bg-gray-900"
          >
            {item.visible ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            {item.visible ? "Shown" : "Hidden"}
          </button>
        </div>
      ) : null}
      <div className="h-full">{children}</div>
    </div>
  );
}
