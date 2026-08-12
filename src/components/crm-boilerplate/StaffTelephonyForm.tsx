"use client";

import { useActionState, useEffect, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { updateStaffTelephonyAction } from "@/lib/actions/phone-system";

type StaffTelephonyUser = {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  landline: string | null;
  voiceRoutingMode: string;
  voiceExtension: string | null;
  voiceAvailability: string;
  sipAddress: string | null;
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

export default function StaffTelephonyForm({ user }: { user: StaffTelephonyUser }) {
  const { showToast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const [state, formAction, isPending] = useActionState(
    updateStaffTelephonyAction,
    {
      ok: false,
      message: "",
      savedAt: null,
    },
  );

  useEffect(() => {
    if (!state.ok || state.savedAt === null) {
      return;
    }

    showToast(state.message || "Staff phone settings saved.");
    queueMicrotask(() => setIsDirty(false));
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <form
      action={formAction}
      onChangeCapture={() => setIsDirty(true)}
      className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <input type="hidden" name="userId" value={user.id} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90">
            {user.name}
          </p>
          <p className="mt-0.5 break-all text-sm text-gray-500 dark:text-gray-400">
            {user.email}
          </p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          <span className="h-2 w-2 rounded-full bg-brand-500" />
          Ext. {user.voiceExtension || "not set"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <Label htmlFor={`routing-${user.id}`}>Routing</Label>
          <div className="relative">
            <select
              id={`routing-${user.id}`}
              name="voiceRoutingMode"
              defaultValue={user.voiceRoutingMode}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {routingModes.map((mode) => (
                <option
                  key={mode.value}
                  value={mode.value}
                  className="text-gray-700 dark:bg-gray-900 dark:text-gray-400"
                >
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor={`availability-${user.id}`}>Availability</Label>
          <select
            id={`availability-${user.id}`}
            name="voiceAvailability"
            defaultValue={user.voiceAvailability}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {availabilityOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="text-gray-700 dark:bg-gray-900 dark:text-gray-400"
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`extension-${user.id}`}>Extension</Label>
          <Input
            id={`extension-${user.id}`}
            name="voiceExtension"
            defaultValue={user.voiceExtension ?? ""}
            placeholder="1001"
          />
        </div>
        <div>
          <Label htmlFor={`mobile-${user.id}`}>Mobile</Label>
          <Input
            id={`mobile-${user.id}`}
            name="mobile"
            defaultValue={user.mobile ?? ""}
            placeholder="+447..."
          />
        </div>
        <div>
          <Label htmlFor={`landline-${user.id}`}>Landline</Label>
          <Input
            id={`landline-${user.id}`}
            name="landline"
            defaultValue={user.landline ?? ""}
            placeholder="+441..."
          />
        </div>
        <div>
          <Label htmlFor={`sip-${user.id}`}>SIP address</Label>
          <Input
            id={`sip-${user.id}`}
            name="sipAddress"
            defaultValue={user.sipAddress ?? ""}
            placeholder="agent@example.sip.twilio.com"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <ActionStateMessage state={state.ok ? undefined : state} />
        <button
          type="submit"
          disabled={!isDirty || isPending}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isPending ? "Saving..." : "Save staff routing"}
        </button>
      </div>
    </form>
  );
}
