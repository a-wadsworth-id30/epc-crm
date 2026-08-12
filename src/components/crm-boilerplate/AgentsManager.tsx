"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import ResponsiveDataList, {
  ResponsiveDataField,
} from "@/components/crm-boilerplate/ResponsiveDataList";
import SummaryMetricTile from "@/components/crm-boilerplate/SummaryMetricTile";
import { updateSingleAgentSettingsAction } from "@/lib/actions/phone-system";

export type AgentManagerQueue = {
  id: string;
  name: string;
  enabled: boolean;
};

export type AgentManagerRow = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  mobile: string | null;
  landline: string | null;
  sipAddress: string | null;
  voiceAvailability: string;
  voiceExtension: string | null;
  voiceLastSeenAt: string | null;
  voiceRoutingMode: string;
  routeTarget: string | null;
  assignedQueueIds: string[];
  maxConcurrentCalls: number;
  forceUnavailable: boolean;
  awayReason: string;
};

type ActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const initialState: ActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

const routingModes = [
  { value: "BROWSER", label: "Browser softphone" },
  { value: "MOBILE", label: "Mobile forwarding" },
  { value: "LANDLINE", label: "Landline forwarding" },
  { value: "SIP", label: "SIP softphone / desk phone" },
  { value: "FLEX", label: "Twilio Flex agent" },
];

const availabilityOptions = [
  { value: "AVAILABLE", label: "Available" },
  { value: "BUSY", label: "Busy" },
  { value: "AWAY", label: "Away" },
  { value: "OFFLINE", label: "Offline" },
];

export default function AgentsManager({
  queues,
  users,
}: {
  queues: AgentManagerQueue[];
  users: AgentManagerRow[];
}) {
  const [editingAgent, setEditingAgent] = useState<AgentManagerRow | null>(null);
  const availableCount = users.filter((user) => user.voiceAvailability === "AVAILABLE").length;
  const routableCount = users.filter((user) => Boolean(user.routeTarget)).length;
  const forcedOfflineCount = users.filter((user) => user.forceUnavailable).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryMetricTile label="Available" value={String(availableCount)} />
        <SummaryMetricTile label="Routable" value={String(routableCount)} />
        <SummaryMetricTile label="Forced offline" value={String(forcedOfflineCount)} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Agents
            </h2>
            <LazyHelpTooltip content="Shows who can receive calls, their current availability, routing destination, team membership and capacity." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Review availability, routing target and team membership. Edit detailed settings from each row.
          </p>
        </div>
        <ResponsiveDataList
          breakpoint="lg"
          cardListClassName="divide-y divide-gray-100 dark:divide-gray-800"
          empty={
            <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No agents are available.
            </p>
          }
          getKey={(user) => user.id}
          items={users}
          renderCard={(user) => (
            <AgentMobileCard
              queues={queues}
              user={user}
              onEdit={() => setEditingAgent(user)}
            />
          )}
          table={
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/[0.02] dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Agent</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Routing target</th>
                    <th className="px-5 py-3">Teams</th>
                    <th className="px-5 py-3">Capacity</th>
                    <th className="px-5 py-3">Last seen</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {users.map((user) => (
                    <tr key={user.id} className="text-sm text-gray-700 dark:text-gray-300">
                      <td className="px-5 py-4">
                        <AgentCell user={user} />
                      </td>
                      <td className="px-5 py-4">
                        <AgentStatus user={user} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-800 dark:text-white/90">
                          {formatSystemValue(user.voiceRoutingMode)}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {user.routeTarget || "No target configured"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <TeamList queueIds={user.assignedQueueIds} queues={queues} />
                      </td>
                      <td className="px-5 py-4">
                        <CapacityBadge count={user.maxConcurrentCalls} />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(user.voiceLastSeenAt)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <AgentEditButton onClick={() => setEditingAgent(user)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      </div>

      {editingAgent ? (
        <AgentEditModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          queues={queues}
        />
      ) : null}
    </div>
  );
}

function AgentMobileCard({
  onEdit,
  queues,
  user,
}: {
  onEdit: () => void;
  queues: AgentManagerQueue[];
  user: AgentManagerRow;
}) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <AgentCell user={user} />
        <AgentEditButton onClick={onEdit} />
      </div>

      <div className="mt-4">
        <AgentStatus user={user} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <ResponsiveDataField label="Routing">
          {formatSystemValue(user.voiceRoutingMode)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Target">
          <span className="block truncate">{user.routeTarget || "No target configured"}</span>
        </ResponsiveDataField>
        <ResponsiveDataField label="Capacity">
          <CapacityBadge count={user.maxConcurrentCalls} />
        </ResponsiveDataField>
        <ResponsiveDataField label="Last seen">
          {formatDate(user.voiceLastSeenAt)}
        </ResponsiveDataField>
      </dl>

      <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
        <p className="mb-2 text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">
          Teams
        </p>
        <TeamList queueIds={user.assignedQueueIds} queues={queues} />
      </div>
    </article>
  );
}

function AgentStatus({ user }: { user: AgentManagerRow }) {
  return (
    <>
      <AvailabilityBadge status={user.voiceAvailability} />
      {user.forceUnavailable ? (
        <div className="mt-1 text-xs font-medium text-error-600 dark:text-error-300">
          Forced unavailable
        </div>
      ) : null}
    </>
  );
}

function CapacityBadge({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
      {count} active call{count === 1 ? "" : "s"}
    </span>
  );
}

function AgentEditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
    >
      Edit
    </button>
  );
}

function AgentEditModal({
  agent,
  onClose,
  queues,
}: {
  agent: AgentManagerRow;
  onClose: () => void;
  queues: AgentManagerQueue[];
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateSingleAgentSettingsAction,
    initialState,
  );

  useEffect(() => {
    if (!state.ok || state.savedAt === null) return;

    queueMicrotask(() => {
      router.refresh();
      onClose();
    });
  }, [onClose, router, state.ok, state.savedAt]);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-3">
            <AgentAvatar
              avatarUrl={agent.avatarUrl}
              name={agent.displayName}
              status={agent.voiceAvailability}
              size="lg"
            />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Edit agent
              </h3>
              <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                {agent.displayName} / {agent.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form action={formAction} className="space-y-5 p-5">
          <input type="hidden" name="userId" value={agent.id} />

          <div className="grid gap-4 lg:grid-cols-2">
            <EditorSection
              title="Phone routing"
              help="Sets how this agent receives calls, including browser softphone, mobile, landline, SIP or Flex routing."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Routing mode">
                  <select name="voiceRoutingMode" defaultValue={agent.voiceRoutingMode} className={inputClassName}>
                    {routingModes.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Manual availability">
                  <select name="voiceAvailability" defaultValue={agent.voiceAvailability} className={inputClassName}>
                    {availabilityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Extension">
                  <input name="voiceExtension" defaultValue={agent.voiceExtension ?? ""} placeholder="1001" className={inputClassName} />
                </Field>
                <Field label="Mobile">
                  <input name="mobile" defaultValue={agent.mobile ?? ""} placeholder="+447..." className={inputClassName} />
                </Field>
                <Field label="Landline">
                  <input name="landline" defaultValue={agent.landline ?? ""} placeholder="+441..." className={inputClassName} />
                </Field>
                <Field label="SIP address">
                  <input name="sipAddress" defaultValue={agent.sipAddress ?? ""} placeholder="agent@example.sip.twilio.com" className={inputClassName} />
                </Field>
              </div>
            </EditorSection>

            <EditorSection
              title="Routing eligibility"
              help="Controls whether this agent can receive calls and how many concurrent calls the routing engine can assign."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Max active calls">
                  <input
                    name="maxConcurrentCalls"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={agent.maxConcurrentCalls}
                    className={inputClassName}
                  />
                </Field>
                <Field label="Away reason">
                  <input name="awayReason" defaultValue={agent.awayReason} placeholder="Optional" className={inputClassName} />
                </Field>
              </div>
              <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800">
                <span>
                  <span className="block font-semibold text-gray-800 dark:text-white/90">
                    Force unavailable
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    Exclude this agent from routing until switched off.
                  </span>
                </span>
                <input
                  name="forceUnavailable"
                  type="checkbox"
                  defaultChecked={agent.forceUnavailable}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500"
                />
              </label>
            </EditorSection>
          </div>

          <EditorSection
            title="Teams"
            help="Assigns this agent to the teams and queues that should be allowed to route calls to them."
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {queues.map((queue) => (
                <label
                  key={queue.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300"
                >
                  <input
                    name="queueIds"
                    type="checkbox"
                    value={queue.id}
                    defaultChecked={agent.assignedQueueIds.includes(queue.id)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500"
                  />
                  <span className="min-w-0 flex-1 truncate">{queue.name}</span>
                  {!queue.enabled ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-white/10">
                      Off
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </EditorSection>

          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <ActionStateMessage state={state.message ? state : undefined} />
            <div className="flex gap-2 sm:ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Saving..." : "Save agent"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function AgentCell({ user }: { user: AgentManagerRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AgentAvatar
        avatarUrl={user.avatarUrl}
        name={user.displayName}
        status={user.voiceAvailability}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
          {user.displayName}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {user.email}
        </p>
      </div>
    </div>
  );
}

function AgentAvatar({
  avatarUrl,
  name,
  size = "md",
  status,
}: {
  avatarUrl: string | null;
  name: string;
  size?: "md" | "lg";
  status: string;
}) {
  const sizeClassName = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const initialsSizeClassName = size === "lg" ? "text-sm" : "text-xs";

  return (
    <span className={`relative inline-flex ${sizeClassName} shrink-0`}>
      <span
        className={`flex h-full w-full items-center justify-center rounded-full bg-gray-900 bg-cover bg-center font-semibold text-white dark:bg-white dark:text-gray-900 ${initialsSizeClassName}`}
        style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
      >
        {avatarUrl ? <span className="sr-only">{name}</span> : agentInitials(name)}
      </span>
      <span
        className={`absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${availabilityDotClass(status)}`}
      />
    </span>
  );
}

function TeamList({
  queueIds,
  queues,
}: {
  queueIds: string[];
  queues: AgentManagerQueue[];
}) {
  if (!queueIds.length) {
    return <span className="text-xs text-gray-400">No teams</span>;
  }

  const visible = queueIds.slice(0, 2);
  const remaining = queueIds.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((queueId) => (
        <span
          key={queueId}
          className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
        >
          {queues.find((queue) => queue.id === queueId)?.name ?? "Unknown team"}
        </span>
      ))}
      {remaining > 0 ? (
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
          +{remaining}
        </span>
      ) : null}
    </div>
  );
}

function AvailabilityBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${availabilityBadgeClass(status)}`}>
      <span className={`h-2 w-2 rounded-full ${availabilityDotClass(status)}`} />
      {formatSystemValue(status)}
    </span>
  );
}

function EditorSection({
  children,
  help,
  title,
}: {
  children: ReactNode;
  help: string;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h4>
        <LazyHelpTooltip content={help} />
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function availabilityBadgeClass(status: string) {
  if (status === "AVAILABLE") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (status === "BUSY") {
    return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
  }
  if (status === "AWAY") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
}

function availabilityDotClass(status: string) {
  if (status === "AVAILABLE") return "bg-success-500";
  if (status === "BUSY") return "bg-error-500";
  if (status === "AWAY") return "bg-warning-500";
  return "bg-gray-400";
}

function agentInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatSystemValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}
