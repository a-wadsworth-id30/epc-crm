"use client";

import { useActionState, useState } from "react";
import {
  disconnectGmailMailboxAction,
  syncGmailMailboxAction,
  updateGmailMailboxAction,
} from "@/lib/actions/gmail";
import {
  gmailMailboxTeamPurposeOptions,
  type GmailMailboxPurpose,
} from "@/lib/integrations/gmail-mailbox-purpose";
import {
  gmailMailboxHealth,
  type GmailMailboxHealthState,
} from "@/lib/integrations/gmail-mailbox-health";

type GmailMailboxRow = {
  automaticRetryAt: string | null;
  id: string;
  displayName: string | null;
  emailAddress: string;
  lastError: string | null;
  lastSyncAt: string | null;
  ownerUserId: string | null;
  purpose: GmailMailboxPurpose;
  sendEnabled: boolean;
  sendUserIds: string[];
  status: "CONNECTED" | "NEEDS_REAUTH" | "DISCONNECTED" | "ERROR";
  syncEnabled: boolean;
};

type UserOption = {
  canUsePersonalMailbox: boolean;
  id: string;
  email: string;
  name: string;
};

const initialState = { ok: false, message: "", savedAt: null };

function formatMailboxSyncTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function healthTone(state: GmailMailboxHealthState) {
  if (state === "healthy") {
    return "border-success-200 bg-success-50 text-success-700 dark:border-success-900/50 dark:bg-success-500/10 dark:text-success-300";
  }
  if (state === "attention") {
    return "border-error-200 bg-error-50 text-error-700 dark:border-error-900/50 dark:bg-error-500/10 dark:text-error-300";
  }
  if (state === "delayed" || state === "warning") {
    return "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-900/50 dark:bg-warning-500/10 dark:text-warning-300";
  }
  return "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-300";
}

export default function GmailIntegrationForm({
  authConfigured,
  healthNow,
  mailboxes,
  providerReady,
  providerMessage,
  users,
}: {
  authConfigured: boolean;
  healthNow: string;
  mailboxes: GmailMailboxRow[];
  providerReady: boolean;
  providerMessage: string;
  users: UserOption[];
}) {
  const healthReference = new Date(healthNow);
  const mailboxHealth = mailboxes.map((mailbox) =>
    gmailMailboxHealth(mailbox, healthReference),
  );
  const healthyCount = mailboxHealth.filter(
    (health) => health.state === "healthy",
  ).length;
  const attentionCount = mailboxHealth.filter((health) =>
    ["attention", "delayed", "warning"].includes(health.state),
  ).length;
  const inactiveCount = mailboxHealth.filter((health) =>
    ["paused", "pending"].includes(health.state),
  ).length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Multi-mailbox Gmail
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Connect accounts, shared sales addresses and individual user mailboxes. Google tokens remain in iD30 Auth.
            </p>
            <p className={`mt-2 text-xs ${providerReady ? "text-success-600" : "text-warning-600"}`}>
              {providerMessage}
            </p>
          </div>
          <a
            href="/api/integrations/gmail/connect"
            aria-disabled={!authConfigured || !providerReady}
            className={`inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white ${
              authConfigured && providerReady
                ? "bg-brand-500 hover:bg-brand-600"
                : "pointer-events-none bg-gray-300 dark:bg-gray-700"
            }`}
          >
            Connect Gmail mailbox
          </a>
        </div>
      </div>

      {mailboxes.length ? (
        <section
          aria-label="Gmail mailbox health summary"
          className="grid gap-3 sm:grid-cols-3"
        >
          <div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-900/50 dark:bg-success-500/10">
            <p className="text-2xl font-semibold text-success-700 dark:text-success-300">
              {healthyCount}
            </p>
            <p className="mt-1 text-sm font-medium text-success-700 dark:text-success-300">
              Healthy
            </p>
          </div>
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-900/50 dark:bg-warning-500/10">
            <p className="text-2xl font-semibold text-warning-700 dark:text-warning-300">
              {attentionCount}
            </p>
            <p className="mt-1 text-sm font-medium text-warning-700 dark:text-warning-300">
              Need attention
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-white/[0.04]">
            <p className="text-2xl font-semibold text-gray-700 dark:text-gray-200">
              {inactiveCount}
            </p>
            <p className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">
              Paused or pending
            </p>
          </div>
        </section>
      ) : null}

      {mailboxes.length ? (
        <div className="space-y-4">
          {mailboxes.map((mailbox) => (
            <MailboxCard
              key={mailbox.id}
              authConfigured={authConfigured}
              healthNow={healthNow}
              mailbox={mailbox}
              providerReady={providerReady}
              users={users}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            No Gmail mailboxes connected
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Connect each operational address separately. Existing MailerSend delivery remains unchanged until Gmail sending is enabled in the CRM workflow.
          </p>
        </div>
      )}
    </div>
  );
}

function MailboxCard({
  authConfigured,
  healthNow,
  mailbox,
  providerReady,
  users,
}: {
  authConfigured: boolean;
  healthNow: string;
  mailbox: GmailMailboxRow;
  providerReady: boolean;
  users: UserOption[];
}) {
  const [saveState, saveAction, saving] = useActionState(
    updateGmailMailboxAction,
    initialState,
  );
  const [disconnectState, disconnectAction, disconnecting] = useActionState(
    disconnectGmailMailboxAction,
    initialState,
  );
  const [syncState, syncAction, syncing] = useActionState(
    syncGmailMailboxAction,
    initialState,
  );
  const connected = mailbox.status === "CONNECTED";
  const health = gmailMailboxHealth(mailbox, new Date(healthNow));
  const [ownerUserId, setOwnerUserId] = useState(mailbox.ownerUserId ?? "");
  const [purpose, setPurpose] = useState<GmailMailboxPurpose>(mailbox.purpose);
  const ownerCanUsePersonalMailbox = Boolean(
    users.find((user) => user.id === ownerUserId)?.canUsePersonalMailbox,
  );

  return (
    <article className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-white/90">
            {mailbox.displayName || mailbox.emailAddress}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{mailbox.emailAddress}</p>
        </div>
        <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${healthTone(health.state)}`}>
          {health.label}
        </span>
      </div>

      <div
        className={`mb-4 rounded-lg border px-4 py-3 ${healthTone(health.state)}`}
        role={health.state === "attention" ? "alert" : undefined}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold">{health.label}</p>
            <p className="mt-1 text-sm leading-6">{health.detail}</p>
          </div>
          {health.canReconnect ? (
            <a
              href="/api/integrations/gmail/connect"
              aria-disabled={!authConfigured || !providerReady}
              className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-semibold ${
                authConfigured && providerReady
                  ? "bg-white text-gray-800 shadow-theme-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700 dark:hover:bg-gray-800"
                  : "pointer-events-none bg-gray-200 text-gray-400 dark:bg-gray-800"
              }`}
            >
              Reconnect Gmail
            </a>
          ) : null}
        </div>
        <dl className="mt-3 grid gap-2 border-t border-current/15 pt-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="font-medium opacity-70">Last successful sync</dt>
            <dd className="mt-0.5 font-semibold">
              {mailbox.lastSyncAt
                ? formatMailboxSyncTime(mailbox.lastSyncAt)
                : "Not yet synced"}
            </dd>
          </div>
          <div>
            <dt className="font-medium opacity-70">Email import</dt>
            <dd className="mt-0.5 font-semibold">
              {mailbox.syncEnabled ? "Enabled" : "Paused"}
            </dd>
          </div>
          <div>
            <dt className="font-medium opacity-70">CRM sending</dt>
            <dd className="mt-0.5 font-semibold">
              {mailbox.sendEnabled && connected ? "Enabled" : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="font-medium opacity-70">Automatic retry</dt>
            <dd className="mt-0.5 font-semibold">
              {mailbox.automaticRetryAt &&
              new Date(mailbox.automaticRetryAt).getTime() >
                new Date(healthNow).getTime()
                ? formatMailboxSyncTime(mailbox.automaticRetryAt)
                : "Normal schedule"}
            </dd>
          </div>
        </dl>
      </div>

      <form action={saveAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="mailboxId" value={mailbox.id} />
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Mailbox purpose
          <select
            name="purpose"
            value={purpose}
            onChange={(event) =>
              setPurpose(event.target.value as GmailMailboxPurpose)
            }
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            {mailbox.purpose === "ACCOUNTS" ? (
              <option value="ACCOUNTS">
                Accounts (legacy — choose a team)
              </option>
            ) : null}
            {mailbox.purpose === "SHARED" ? (
              <option value="SHARED">
                Other shared (legacy — choose a team)
              </option>
            ) : null}
            {gmailMailboxTeamPurposeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            <option value="PERSONAL" disabled={!ownerCanUsePersonalMailbox}>
              Personal (Owner / director only)
            </option>
          </select>
          <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">
            Matches Phone System teams. Personal requires an Owner/director-level primary user.
          </span>
        </label>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Primary user
          <select
            name="ownerUserId"
            value={ownerUserId}
            onChange={(event) => {
              const nextOwnerUserId = event.target.value;
              setOwnerUserId(nextOwnerUserId);
              if (
                purpose === "PERSONAL" &&
                !users.find(
                  (user) =>
                    user.id === nextOwnerUserId &&
                    user.canUsePersonalMailbox,
                )
              ) {
                setPurpose("SALES");
              }
            }}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Shared / no single owner</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" name="syncEnabled" defaultChecked={mailbox.syncEnabled} disabled={!connected} />
          Import sent and received email
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" name="sendEnabled" defaultChecked={mailbox.sendEnabled} disabled={!connected} />
          Allow CRM users to send from this mailbox
        </label>
        <fieldset className="rounded-lg border border-gray-200 p-3 md:col-span-2 dark:border-gray-800">
          <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Users allowed to send
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => (
              <label key={user.id} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  name="sendUserIds"
                  value={user.id}
                  defaultChecked={mailbox.sendUserIds.includes(user.id)}
                  disabled={!connected}
                />
                {user.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button
            type="submit"
            disabled={saving || !connected}
            className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {saving ? "Saving..." : "Save mailbox"}
          </button>
          {saveState.message ? (
            <span className={`text-xs ${saveState.ok ? "text-success-600" : "text-error-600"}`}>
              {saveState.message}
            </span>
          ) : null}
        </div>
      </form>

      {connected ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <form action={syncAction}>
            <input type="hidden" name="mailboxId" value={mailbox.id} />
            <button
              type="submit"
              disabled={syncing || !mailbox.syncEnabled}
              className="text-sm font-semibold text-brand-600 hover:text-brand-700 disabled:text-gray-400"
            >
              {syncing ? "Syncing..." : "Sync Gmail now"}
            </button>
            {syncState.message ? (
              <span className={`ml-3 text-xs ${syncState.ok ? "text-success-600" : "text-error-600"}`}>
                {syncState.message}
              </span>
            ) : null}
          </form>
          <form action={disconnectAction}>
            <input type="hidden" name="mailboxId" value={mailbox.id} />
            <button
              type="submit"
              disabled={disconnecting}
              className="text-sm font-semibold text-error-600 hover:text-error-700 disabled:text-gray-400"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect mailbox"}
            </button>
            {disconnectState.message ? (
              <span className={`ml-3 text-xs ${disconnectState.ok ? "text-success-600" : "text-error-600"}`}>
                {disconnectState.message}
              </span>
            ) : null}
          </form>
        </div>
      ) : null}
    </article>
  );
}
