"use client";

import type { EmailMailboxOption } from "@/lib/inbox/types";

type EmailMailboxSenderFieldProps = {
  disabled?: boolean;
  id: string;
  mailboxes: EmailMailboxOption[];
  onChange: (mailboxId: string) => void;
  originalMailboxId?: string | null;
  value: string;
};

function mailboxLabel(mailbox: EmailMailboxOption) {
  return mailbox.displayName &&
    mailbox.displayName.trim().toLowerCase() !==
      mailbox.emailAddress.trim().toLowerCase()
    ? `${mailbox.displayName} <${mailbox.emailAddress}>`
    : mailbox.emailAddress;
}

export default function EmailMailboxSenderField({
  disabled = false,
  id,
  mailboxes,
  onChange,
  originalMailboxId,
  value,
}: EmailMailboxSenderFieldProps) {
  const changesMailbox = Boolean(value && value !== originalMailboxId);

  return (
    <div className="min-w-0">
      <label
        className="flex h-5 items-center text-xs font-semibold text-gray-500 uppercase dark:text-gray-400"
        htmlFor={id}
      >
        From
      </label>
      <select
        className="mt-1 h-10 min-w-0 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
        disabled={disabled || mailboxes.length < 2}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {mailboxes.map((mailbox) => (
          <option key={mailbox.id} value={mailbox.id}>
            {mailboxLabel(mailbox)}
          </option>
        ))}
      </select>
      {changesMailbox ? (
        <p className="mt-1 text-xs font-medium text-warning-600 dark:text-warning-400">
          This account cannot continue the original Gmail thread. The sender
          change is recorded in the audit log.
        </p>
      ) : (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {mailboxes.length > 1
            ? "Choose an authorised connected account."
            : "This is the available sending account."}
        </p>
      )}
    </div>
  );
}
