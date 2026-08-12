"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  createPhoneQueueAction,
  createPhoneRoutingRuleAction,
  deletePhoneQueueAction,
  deletePhoneRoutingRuleAction,
  updateAgentRoutingSettingsAction,
  updateBusinessHoursAction,
  updateQueuesAction,
  updateRoutingRulesAction,
} from "@/lib/actions/phone-system";

type ActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

type Queue = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  ringStrategy: string;
  holdAudio: string;
  slaSeconds: number;
  overflowSeconds: number;
  fallbackDestination: string;
  fallbackQueueId: string | null;
  assignedAgentIds: string[];
  recording: {
    enabled: boolean;
    transcriptEnabled: boolean;
    aiAnalysisEnabled: boolean;
  };
};

type RoutingRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  condition: string;
  queueId: string;
  ringStrategy: string;
  timeoutSeconds: number;
  fallbackDestination: string;
  fallbackQueueId: string | null;
};

type Day = {
  day: number;
  label: string;
  open: boolean;
  start: string;
  end: string;
};

type Holiday = {
  name: string;
  date: string;
};

type AfterHours = {
  destination: string;
  queueId: string | null;
  voicemailMessage: string;
  notificationEmail: string;
  createTask: boolean;
};

type Agent = {
  id: string;
  displayName: string;
  email: string;
};

type AgentSettings = {
  userId: string;
  assignedQueueIds: string[];
  maxConcurrentCalls: number;
  forceUnavailable: boolean;
  awayReason: string;
};

const initialState: ActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

function useActionToast(state: ActionState) {
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message || state.savedAt === null) return;
    showToast(state.message, state.ok ? "success" : "error");
  }, [showToast, state]);
}

function DeleteQueueButton({
  disabled,
  queueId,
}: {
  disabled: boolean;
  queueId: string;
}) {
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deletePhoneQueueAction.bind(null, queueId),
    initialState,
  );
  useActionToast(deleteState);

  return (
    <button
      type="submit"
      formAction={deleteAction}
      disabled={disabled || isDeleting}
      className="inline-flex h-9 items-center justify-center rounded-lg border border-error-200 px-3 text-xs font-semibold text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/50 dark:text-error-300 dark:hover:bg-error-900/20"
    >
      Delete team
    </button>
  );
}

function DeleteRoutingRuleButton({
  disabled,
  ruleId,
}: {
  disabled: boolean;
  ruleId: string;
}) {
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deletePhoneRoutingRuleAction.bind(null, ruleId),
    initialState,
  );
  useActionToast(deleteState);

  return (
    <button
      type="submit"
      formAction={deleteAction}
      disabled={disabled || isDeleting}
      className="inline-flex h-9 items-center justify-center rounded-lg border border-error-200 px-3 text-xs font-semibold text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/50 dark:text-error-300 dark:hover:bg-error-900/20"
    >
      Delete rule
    </button>
  );
}

export function BusinessHoursSettingsForm({
  afterHours,
  holidays,
  queues,
  timezone,
  weekly,
}: {
  afterHours: AfterHours;
  holidays: Holiday[];
  queues: Queue[];
  timezone: string;
  weekly: Day[];
}) {
  const [state, formAction, isPending] = useActionState(
    updateBusinessHoursAction,
    initialState,
  );
  useActionToast(state);

  const afterHoursTeam =
    queues.find((queue) => queue.id === afterHours.queueId)?.name ?? "No team selected";

  return (
    <form action={formAction} className="min-w-0 space-y-5">
      <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Weekly schedule
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              This schedule decides whether calls continue into Routing SmartFlow or use the closed route.
            </p>
          </div>
          <label className="flex w-full min-w-0 flex-col gap-1.5 text-xs font-medium text-gray-500 sm:w-auto sm:min-w-[220px] sm:flex-row sm:items-center sm:gap-2 dark:text-gray-400">
            Timezone
            <input
              name="timezone"
              defaultValue={timezone}
              className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </label>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="min-w-[560px] divide-y divide-gray-200 text-sm md:min-w-full dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.03]">
              <tr>
                <BusinessHoursHeadCell>Day</BusinessHoursHeadCell>
                <BusinessHoursHeadCell>Open</BusinessHoursHeadCell>
                <BusinessHoursHeadCell>Start</BusinessHoursHeadCell>
                <BusinessHoursHeadCell>Finish</BusinessHoursHeadCell>
                <BusinessHoursHeadCell>Status</BusinessHoursHeadCell>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {weekly.map((day) => (
                <tr key={day.day} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">
                    {day.label}
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        name={`day-${day.day}-open`}
                        type="checkbox"
                        defaultChecked={day.open}
                        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {day.open ? "Open" : "Closed"}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      name={`day-${day.day}-start`}
                      type="time"
                      defaultValue={day.start}
                      className="h-10 w-[130px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      name={`day-${day.day}-end`}
                      type="time"
                      defaultValue={day.end}
                      className="h-10 w-[130px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        day.open
                          ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                          : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                      }`}
                    >
                      {day.open ? `${day.start}-${day.end}` : "Closed all day"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                After-hours route
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Used when the weekly schedule or a holiday closure says closed.
              </p>
            </div>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
              Closed path
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="After-hours destination">
              <select
                name="afterHoursDestination"
                defaultValue={afterHours.destination}
                className={inputClassName}
              >
                <option value="MISSED_CALL_TASK">Create missed-call task</option>
                <option value="VOICEMAIL">Voicemail</option>
                <option value="QUEUE">Send to another team</option>
                <option value="HANGUP">Play message and hang up</option>
              </select>
            </Field>
            <Field label="Fallback team">
              <select
                name="afterHoursQueueId"
                defaultValue={afterHours.queueId ?? ""}
                className={inputClassName}
              >
                <option value="">No team</option>
                {queues.map((queue) => (
                  <option key={queue.id} value={queue.id}>
                    {queue.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notification email">
              <input
                name="notificationEmail"
                defaultValue={afterHours.notificationEmail}
                className={inputClassName}
              />
            </Field>
            <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">
              <input
                name="createTask"
                type="checkbox"
                defaultChecked={afterHours.createTask}
                className="h-4 w-4 rounded border-gray-300 text-brand-500"
              />
              Create missed-call task after hours
            </label>
            <div className="md:col-span-2">
              <Field label="Voicemail / closed message">
                <textarea
                  name="voicemailMessage"
                  defaultValue={afterHours.voicemailMessage}
                  rows={3}
                  className={textareaClassName}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Holiday closures
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              One per line, before weekly hours.
            </p>
          </div>
          <Field label="Closure dates">
            <textarea
              name="holidays"
              defaultValue={holidays
                .map((holiday) => `${holiday.date} | ${holiday.name}`)
                .join("\n")}
              rows={7}
              placeholder="2026-12-25 | Christmas Day"
              className={textareaClassName}
            />
          </Field>
          <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
            Current closed route: {formatFormValue(afterHours.destination)}
            {afterHours.destination === "QUEUE" ? ` to ${afterHoursTeam}` : ""}
          </div>
        </section>
      </div>

      <FormFooter isPending={isPending} state={state} label="Save business hours" />
    </form>
  );
}

function BusinessHoursHeadCell({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {children}
    </th>
  );
}

export function QueueSettingsForm({
  agents,
  queues,
}: {
  agents: Agent[];
  queues: Queue[];
}) {
  const [state, formAction, isPending] = useActionState(updateQueuesAction, initialState);
  const [createState, createAction, isCreating] = useActionState(
    createPhoneQueueAction,
    initialState,
  );
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);
  useActionToast(state);
  useActionToast(createState);

  const editingTeam = useMemo(
    () => queues.find((queue) => queue.id === editingTeamId) ?? null,
    [editingTeamId, queues],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Teams
            </h3>
            <LazyHelpTooltip content="Manages call teams, their members, ring strategy, fallback behaviour and call intelligence policy." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage membership, routing behaviour and call intelligence in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreatingTeam(true)}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-xs hover:bg-brand-600"
        >
          New team
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.03]">
              <tr>
                <TeamHeaderCell>Team</TeamHeaderCell>
                <TeamHeaderCell>Members</TeamHeaderCell>
                <TeamHeaderCell>Ring strategy</TeamHeaderCell>
                <TeamHeaderCell>SLA</TeamHeaderCell>
                <TeamHeaderCell>Fallback</TeamHeaderCell>
                <TeamHeaderCell>Call intelligence</TeamHeaderCell>
                <TeamHeaderCell align="right">Actions</TeamHeaderCell>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {queues.map((queue) => {
                const members = agents.filter((agent) =>
                  queue.assignedAgentIds.includes(agent.id),
                );

                return (
                  <tr key={queue.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                    <td className="px-5 py-4">
                      <div className="flex min-w-[190px] items-center gap-3">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            queue.enabled ? "bg-success-500" : "bg-gray-400"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-800 dark:text-white/90">
                            {queue.name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            Priority {queue.priority}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <TeamAvatarStack agents={members} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-700 dark:text-gray-300">
                      {formatFormValue(queue.ringStrategy)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-700 dark:text-gray-300">
                      {queue.slaSeconds}s
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-700 dark:text-gray-300">
                      {formatFallback(queue, queues)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <MiniPolicyPill enabled={queue.recording.enabled} label="Recording" />
                        <MiniPolicyPill enabled={queue.recording.transcriptEnabled} label="Transcript" />
                        <MiniPolicyPill enabled={queue.recording.aiAnalysisEnabled} label="AI" />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingTeamId(queue.id)}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          <ActionStateMessage state={state.savedAt ? state : undefined} />
          <ActionStateMessage state={createState.savedAt ? createState : undefined} />
        </div>
      </div>

      {editingTeam && (
        <TeamModal title={`Edit ${editingTeam.name}`} onClose={() => setEditingTeamId(null)}>
          <form action={formAction} className="space-y-5">
            {queues.map((queue) =>
              queue.id === editingTeam.id ? (
                <TeamEditFields
                  key={queue.id}
                  agents={agents}
                  queue={queue}
                  queues={queues}
                />
              ) : (
                <HiddenQueueFields key={queue.id} queue={queue} />
              ),
            )}
            <div className="flex flex-col gap-3 border-t border-gray-200 pt-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
              <DeleteQueueButton disabled={queues.length <= 1} queueId={editingTeam.id} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTeamId(null)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-theme-xs hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  {isPending ? "Saving..." : "Save team"}
                </button>
              </div>
            </div>
            <ActionStateMessage state={state.savedAt ? state : undefined} />
          </form>
        </TeamModal>
      )}

      {creatingTeam && (
        <TeamModal title="New team" onClose={() => setCreatingTeam(false)}>
          <form action={createAction} className="space-y-5">
            <Field label="Team name">
              <input
                name="queueName"
                placeholder="New team name"
                required
                className={inputClassName}
              />
            </Field>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-5 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setCreatingTeam(false)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? "Creating..." : "Create team"}
              </button>
            </div>
            <ActionStateMessage state={createState.savedAt ? createState : undefined} />
          </form>
        </TeamModal>
      )}
    </div>
  );
}

function TeamEditFields({
  agents,
  queue,
  queues,
}: {
  agents: Agent[];
  queue: Queue;
  queues: Queue[];
}) {
  return (
    <>
      <input type="hidden" name="queueId" value={queue.id} />
      <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_170px]">
        <Field label="Team name">
          <input
            name={`queue-${queue.id}-name`}
            defaultValue={queue.name}
            className={inputClassName}
          />
        </Field>
        <Field label="Priority">
          <input
            name={`queue-${queue.id}-priority`}
            type="number"
            min={1}
            defaultValue={queue.priority}
            className={inputClassName}
          />
        </Field>
        <div className="pt-6">
          <Toggle
            name={`queue-${queue.id}-enabled`}
            label="Team enabled"
            defaultChecked={queue.enabled}
          />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Members"
          detail="Choose the agents this team can ring when routing sends a caller here."
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {agents.map((agent) => (
            <label
              key={agent.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300"
            >
              <input
                name={`queue-${queue.id}-agentIds`}
                type="checkbox"
                value={agent.id}
                defaultChecked={queue.assignedAgentIds.includes(agent.id)}
                className="h-4 w-4 rounded border-gray-300 text-brand-500"
              />
              <TeamAvatar name={agent.displayName} />
              <span className="min-w-0">
                <span className="block truncate font-medium text-gray-800 dark:text-white/90">
                  {agent.displayName}
                </span>
                <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                  {agent.email}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          title="Routing behaviour"
          detail="Control how the team rings and what callers hear while waiting."
        />
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Field label="Ring strategy">
            <select
              name={`queue-${queue.id}-ringStrategy`}
              defaultValue={queue.ringStrategy}
              className={inputClassName}
            >
              <option value="SIMULTANEOUS">Simultaneous</option>
              <option value="ROUND_ROBIN">Round robin</option>
              <option value="PRIORITY">Priority order</option>
            </select>
          </Field>
          <Field label="Caller hears">
            <select
              name={`queue-${queue.id}-holdAudio`}
              defaultValue={queue.holdAudio || "RING"}
              className={inputClassName}
            >
              <option value="RING">Ring tone</option>
              <option value="MUSIC">Music</option>
            </select>
          </Field>
          <Field label="SLA seconds">
            <input
              name={`queue-${queue.id}-slaSeconds`}
              type="number"
              min={5}
              defaultValue={queue.slaSeconds}
              className={inputClassName}
            />
          </Field>
          <Field label="Overflow">
            <input
              name={`queue-${queue.id}-overflowSeconds`}
              type="number"
              min={5}
              defaultValue={queue.overflowSeconds}
              className={inputClassName}
            />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading
          title="Fallback"
          detail="Decide what happens if no one in this team answers."
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Fallback">
            <select
              name={`queue-${queue.id}-fallbackDestination`}
              defaultValue={queue.fallbackDestination}
              className={inputClassName}
            >
              <option value="MISSED_CALL_TASK">Missed-call task</option>
              <option value="VOICEMAIL">Voicemail</option>
              <option value="QUEUE">Another team</option>
              <option value="HANGUP">Hang up</option>
            </select>
          </Field>
          <Field label="Fallback team">
            <select
              name={`queue-${queue.id}-fallbackQueueId`}
              defaultValue={queue.fallbackQueueId ?? ""}
              className={inputClassName}
            >
              <option value="">No team</option>
              {queues
                .filter((option) => option.id !== queue.id)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading
          title="Recording & AI"
          detail="Set the call intelligence policy for calls handled by this team."
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Toggle
            name={`queue-${queue.id}-recording`}
            label="Record calls"
            defaultChecked={queue.recording.enabled}
          />
          <Toggle
            name={`queue-${queue.id}-transcripts`}
            label="Generate transcripts"
            defaultChecked={queue.recording.transcriptEnabled}
          />
          <Toggle
            name={`queue-${queue.id}-ai`}
            label="Run AI analysis"
            defaultChecked={queue.recording.aiAnalysisEnabled}
          />
        </div>
      </section>
    </>
  );
}

function HiddenQueueFields({ queue }: { queue: Queue }) {
  return (
    <>
      <input type="hidden" name="queueId" value={queue.id} />
      <input type="hidden" name={`queue-${queue.id}-name`} value={queue.name} />
      <input type="hidden" name={`queue-${queue.id}-priority`} value={queue.priority} />
      <input type="hidden" name={`queue-${queue.id}-ringStrategy`} value={queue.ringStrategy} />
      <input type="hidden" name={`queue-${queue.id}-holdAudio`} value={queue.holdAudio || "RING"} />
      <input type="hidden" name={`queue-${queue.id}-slaSeconds`} value={queue.slaSeconds} />
      <input type="hidden" name={`queue-${queue.id}-overflowSeconds`} value={queue.overflowSeconds} />
      <input type="hidden" name={`queue-${queue.id}-fallbackDestination`} value={queue.fallbackDestination} />
      <input type="hidden" name={`queue-${queue.id}-fallbackQueueId`} value={queue.fallbackQueueId ?? ""} />
      {queue.enabled && <input type="hidden" name={`queue-${queue.id}-enabled`} value="on" />}
      {queue.recording.enabled && <input type="hidden" name={`queue-${queue.id}-recording`} value="on" />}
      {queue.recording.transcriptEnabled && <input type="hidden" name={`queue-${queue.id}-transcripts`} value="on" />}
      {queue.recording.aiAnalysisEnabled && <input type="hidden" name={`queue-${queue.id}-ai`} value="on" />}
      {queue.assignedAgentIds.map((agentId) => (
        <input
          key={agentId}
          type="hidden"
          name={`queue-${queue.id}-agentIds`}
          value={agentId}
        />
      ))}
    </>
  );
}

function TeamModal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-999999 flex items-center justify-center bg-gray-950/50 px-4 py-8">
      <div className="max-h-[calc(100vh-4rem)] w-full max-w-4xl overflow-auto rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05]"
            aria-label="Close"
          >
            x
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function TeamHeaderCell({
  align = "left",
  children,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <th
      className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function TeamAvatarStack({ agents }: { agents: Agent[] }) {
  const visibleAgents = agents.slice(0, 5);
  const overflow = agents.length - visibleAgents.length;

  if (!agents.length) {
    return <span className="text-xs text-gray-500 dark:text-gray-400">No members</span>;
  }

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {visibleAgents.map((agent) => (
          <TeamAvatar key={agent.id} name={agent.displayName} />
        ))}
        {overflow > 0 && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xs font-semibold text-gray-700 dark:border-gray-900 dark:bg-gray-800 dark:text-gray-200">
            +{overflow}
          </span>
        )}
      </div>
      <span className="ml-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
        {agents.length} {agents.length === 1 ? "member" : "members"}
      </span>
    </div>
  );
}

function TeamAvatar({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gray-900 text-xs font-semibold text-white dark:border-gray-900 dark:bg-white dark:text-gray-900"
    >
      {teamInitials(name)}
    </span>
  );
}

function MiniPolicyPill({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        enabled
          ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
      }`}
    >
      {label}
    </span>
  );
}

function SectionHeading({ detail, title }: { detail: string; title: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {title}
        </h3>
        <LazyHelpTooltip content={detail} />
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function formatFallback(queue: Queue, queues: Queue[]) {
  if (queue.fallbackDestination === "QUEUE") {
    return queues.find((item) => item.id === queue.fallbackQueueId)?.name ?? "Another team";
  }

  return formatFormValue(queue.fallbackDestination);
}

function formatFormValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function teamInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function RoutingRulesForm({
  queues,
  rules,
}: {
  queues: Queue[];
  rules: RoutingRule[];
}) {
  const [state, formAction, isPending] = useActionState(
    updateRoutingRulesAction,
    initialState,
  );
  const [createState, createAction, isCreating] = useActionState(
    createPhoneRoutingRuleAction,
    initialState,
  );
  useActionToast(state);
  useActionToast(createState);

  return (
    <div className="space-y-4">
      <form
        action={createAction}
        className="grid gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-white/[0.03] sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <input
          name="ruleName"
          placeholder="New routing rule name"
          required
          className={inputClassName}
          aria-label="New routing rule name"
        />
        <button
          type="submit"
          disabled={isCreating}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? "Adding..." : "Add rule"}
        </button>
        <div className="sm:col-span-2">
          <ActionStateMessage state={createState.savedAt ? createState : undefined} />
        </div>
      </form>

      <form action={formAction} className="space-y-4">
        {rules.map((rule, index) => (
        <div key={rule.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <input type="hidden" name="ruleId" value={rule.id} />
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {rule.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Priority {rule.priority}
              </p>
            </div>
            <DeleteRoutingRuleButton disabled={rules.length <= 1} ruleId={rule.id} />
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_100px_160px_120px]">
            <Field label={`Rule ${index + 1}`}>
              <input
                name={`rule-${rule.id}-name`}
                defaultValue={rule.name}
                className={inputClassName}
              />
            </Field>
            <Field label="Priority">
              <input
                name={`rule-${rule.id}-priority`}
                type="number"
                min={1}
                defaultValue={rule.priority}
                className={inputClassName}
              />
            </Field>
            <Field label="Send to team">
              <select
                name={`rule-${rule.id}-queueId`}
                defaultValue={rule.queueId}
                className={inputClassName}
              >
                {queues.map((queue) => (
                  <option key={queue.id} value={queue.id}>
                    {queue.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Timeout">
              <input
                name={`rule-${rule.id}-timeoutSeconds`}
                type="number"
                min={5}
                defaultValue={rule.timeoutSeconds}
                className={inputClassName}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Condition">
              <input
                name={`rule-${rule.id}-condition`}
                defaultValue={rule.condition}
                className={inputClassName}
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Ring strategy">
              <select
                name={`rule-${rule.id}-ringStrategy`}
                defaultValue={rule.ringStrategy}
                className={inputClassName}
              >
                <option value="QUEUE_DEFAULT">Team default</option>
                <option value="SIMULTANEOUS">Simultaneous</option>
                <option value="ROUND_ROBIN">Round robin</option>
                <option value="PRIORITY">Priority order</option>
              </select>
            </Field>
            <Field label="Fallback">
              <select
                name={`rule-${rule.id}-fallbackDestination`}
                defaultValue={rule.fallbackDestination}
                className={inputClassName}
              >
                <option value="QUEUE_DEFAULT">Team default</option>
                <option value="MISSED_CALL_TASK">Missed-call task</option>
                <option value="VOICEMAIL">Voicemail</option>
                <option value="QUEUE">Another team</option>
              </select>
            </Field>
            <Field label="Fallback team">
              <select
                name={`rule-${rule.id}-fallbackQueueId`}
                defaultValue={rule.fallbackQueueId ?? ""}
                className={inputClassName}
              >
                <option value="">No team</option>
                {queues.map((queue) => (
                  <option key={queue.id} value={queue.id}>
                    {queue.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Toggle
              name={`rule-${rule.id}-enabled`}
              label="Rule enabled"
              defaultChecked={rule.enabled}
            />
          </div>
        </div>
        ))}
        <FormFooter isPending={isPending} state={state} label="Save routing rules" />
      </form>
    </div>
  );
}

export function AgentRoutingSettingsForm({
  agents,
  queues,
  settings,
}: {
  agents: Agent[];
  queues: Queue[];
  settings: AgentSettings[];
}) {
  const [state, formAction, isPending] = useActionState(
    updateAgentRoutingSettingsAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      {agents.map((agent) => {
        const agentSettings = settings.find((item) => item.userId === agent.id);

        return (
          <div
            key={agent.id}
            className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
          >
            <input type="hidden" name="userId" value={agent.id} />
            <div className="grid gap-3 md:grid-cols-[1fr_150px_1fr]">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {agent.displayName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{agent.email}</p>
              </div>
              <Field label="Max active calls">
                <input
                  name={`agent-${agent.id}-maxConcurrentCalls`}
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={agentSettings?.maxConcurrentCalls ?? 1}
                  className={inputClassName}
                />
              </Field>
              <Field label="Away reason">
                <input
                  name={`agent-${agent.id}-awayReason`}
                  defaultValue={agentSettings?.awayReason ?? ""}
                  className={inputClassName}
                />
              </Field>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {queues.map((queue) => (
                <label
                  key={queue.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300"
                >
                  <input
                    name={`agent-${agent.id}-queueIds`}
                    type="checkbox"
                    value={queue.id}
                    defaultChecked={Boolean(agentSettings?.assignedQueueIds.includes(queue.id))}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500"
                  />
                  {queue.name}
                </label>
              ))}
            </div>
            <div className="mt-3">
              <Toggle
                name={`agent-${agent.id}-forceUnavailable`}
                label="Force unavailable for routing"
                defaultChecked={agentSettings?.forceUnavailable ?? false}
              />
            </div>
          </div>
        );
      })}
      <FormFooter isPending={isPending} state={state} label="Save agent routing" />
    </form>
  );
}

function FormFooter({
  isPending,
  label,
  state,
}: {
  isPending: boolean;
  label: string;
  state: ActionState;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <ActionStateMessage state={state.savedAt ? state : undefined} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
      >
        {isPending ? "Saving..." : label}
      </button>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  defaultChecked,
  label,
  name,
}: {
  defaultChecked: boolean;
  label: string;
  name: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-2 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">
      {label}
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-gray-300 text-brand-500"
      />
    </label>
  );
}

const inputClassName =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

const textareaClassName =
  "w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";
