"use client";

import { useState } from "react";
import { isUntrustedReplyRecipient } from "@/lib/inbox/recipient-safety";

export type LockedEmailRecipientFieldProps = {
  disabled?: boolean;
  id: string;
  linkedAddresses?: Array<string | null | undefined>;
  onChange: (value: string) => void;
  onOverrideConfirmationChange?: (confirmed: boolean) => void;
  overrideConfirmed?: boolean;
  value: string;
};

export default function LockedEmailRecipientField({
  disabled = false,
  id,
  linkedAddresses = [],
  onChange,
  onOverrideConfirmationChange,
  overrideConfirmed = false,
  value,
}: LockedEmailRecipientFieldProps) {
  const [isEditing, setIsEditing] = useState(!value.trim());
  const untrustedRecipient = isUntrustedReplyRecipient(value, linkedAddresses);
  const warningId = `${id}-warning`;

  return (
    <div className="min-w-0">
      <div className="flex h-5 items-center justify-between gap-2">
        <label
          className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400"
          htmlFor={id}
        >
          To
        </label>
        <button
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-400"
          disabled={disabled || (isEditing && !value.trim())}
          onClick={() => setIsEditing((current) => !current)}
          type="button"
        >
          {isEditing ? "Lock recipient" : "Change recipient"}
        </button>
      </div>
      <input
        aria-describedby={untrustedRecipient ? warningId : undefined}
        aria-readonly={!isEditing}
        className={`mt-1 h-10 w-full min-w-0 rounded-lg border px-3 text-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:text-white/90 ${
          isEditing
            ? "border-gray-300 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-950"
            : "cursor-default border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-white/[0.03]"
        }`}
        disabled={disabled}
        id={id}
        onChange={(event) => {
          onChange(event.target.value);
          onOverrideConfirmationChange?.(false);
        }}
        placeholder="customer@example.com"
        readOnly={!isEditing}
        required
        type="email"
        value={value}
      />
      {untrustedRecipient ? (
        <div
          className="mt-1.5 rounded-lg border border-warning-200 bg-warning-50 px-2.5 py-2 text-xs text-warning-800 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-200"
          id={warningId}
        >
          <p className="font-medium">
            This address is not the original reply address or the linked
            contact&apos;s saved email.
          </p>
          <label className="mt-2 flex cursor-pointer items-start gap-2 font-semibold">
            <input
              type="checkbox"
              checked={overrideConfirmed}
              disabled={disabled}
              onChange={(event) =>
                onOverrideConfirmationChange?.(event.target.checked)
              }
              className="mt-0.5 h-4 w-4 rounded border-warning-300 text-brand-500 focus:ring-brand-500"
            />
            I have checked this recipient and intend to send to this address.
          </label>
        </div>
      ) : !isEditing ? (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Recipient locked to prevent accidental changes.
        </p>
      ) : null}
    </div>
  );
}
