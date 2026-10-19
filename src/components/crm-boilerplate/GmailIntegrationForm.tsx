"use client";

import { useActionState } from "react";
import {
  disconnectGmailMailboxAction,
  syncGmailMailboxAction,
  updateGmailMailboxAction,
} from "@/lib/actions/gmail";

type GmailMailboxRow = {
  id: string;
  displayName: string | null;
  emailAddress: string;
  lastError: string | null;
  lastSyncAt: string | null;
  ownerUserId: string | null;
  purpose: "PERSONAL" | "SALES" | "ACCOUNTS" | "SHARED";
  sendEnabled: boolean;
  sendUserIds: string[];
  status: "CONNECTED" | "NEEDS_REAUTH" | "DISCONNECTED" | "ERROR";
  syncEnabled: boolean;
};

type UserOption = { id: string; email: string; name: string };

const initialState = { ok: false, message: "", savedAt: null };

export default function GmailIntegrationForm({
  authConfigured,
  mailboxes,
  providerReady,
  providerMessage,
  users,
}: {
  authConfigured: boolean;
  mailboxes: GmailMailboxRow[];
  providerReady: boolean;
  providerMessage: string;
  users: UserOption[];
}) {
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
        <div className="space-y-4">
          {mailboxes.map((mailbox) => (
            <MailboxCard key={mailbox.id} mailbox={mailbox} users={users} />
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

function MailboxCard({ mailbox, users }: { mailbox: GmailMailboxRow; users: UserOption[] }) {
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

  return (
    <article className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-white/90">
            {mailbox.displayName || mailbox.emailAddress}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{mailbox.emailAddress}</p>
        </div>
        <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
          connected
            ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
            : "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
        }`}>
          {mailbox.status.replaceAll("_", " ").toLowerCase()}
        </span>
      </div>

      <form action={saveAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="mailboxId" value={mailbox.id} />
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Mailbox purpose
          <select
            name="purpose"
            defaultValue={mailbox.purpose}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="PERSONAL">Personal sales mailbox</option>
            <option value="SALES">Shared sales mailbox</option>
            <option value="ACCOUNTS">Accounts mailbox</option>
            <option value="SHARED">Other shared mailbox</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Primary user
          <select
            name="ownerUserId"
            defaultValue={mailbox.ownerUserId ?? ""}
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
          {mailbox.lastSyncAt ? (
            <span className="text-xs text-gray-500">Last sync: {new Date(mailbox.lastSyncAt).toLocaleString()}</span>
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
      {mailbox.lastError ? <p className="mt-3 text-xs text-error-600">{mailbox.lastError}</p> : null}
    </article>
  );
}
