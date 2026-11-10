"use client";

import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  createContactTypeAction,
  toggleContactTypeActiveAction,
  updateContactTypeAction,
  type ContactTypeActionState,
} from "@/lib/actions/contact-types";

export type ContactTypeManagerItem = {
  id: string;
  name: string;
  pluralName: string;
  slug: string;
  description: string | null;
  systemKey: string | null;
  colourKey: string;
  iconKey: string;
  displayOrder: number;
  isDefault: boolean;
  isActive: boolean;
  contactCount: number;
};

const initialState: ContactTypeActionState = {
  ok: false,
  message: "",
  savedAt: null,
};
const inputClassName =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const textareaClassName = `${inputClassName} min-h-20 py-2`;

export default function ContactTypeManager({
  contactTypes,
  nextDisplayOrder,
}: {
  contactTypes: ContactTypeManagerItem[];
  nextDisplayOrder: number;
}) {
  const { showToast } = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createContactTypeAction,
    initialState,
  );
  const [updateState, updateAction, isUpdating] = useActionState(
    updateContactTypeAction,
    initialState,
  );
  const [toggleState, toggleAction, isToggling] = useActionState(
    toggleContactTypeActiveAction,
    initialState,
  );

  useEffect(() => {
    if (createState.message) {
      showToast(createState.message, createState.ok ? "success" : "error");
    }
  }, [createState, showToast]);
  useEffect(() => {
    if (updateState.message) {
      showToast(updateState.message, updateState.ok ? "success" : "error");
    }
  }, [showToast, updateState]);
  useEffect(() => {
    if (toggleState.message) {
      showToast(toggleState.message, toggleState.ok ? "success" : "error");
    }
  }, [showToast, toggleState]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Add person type
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Person types provide the primary classification used by People. Tags and segments remain available for overlapping groups.
        </p>
        <form action={createAction} className="mt-5 space-y-4">
          <ContactTypeFields displayOrder={nextDisplayOrder} />
          <ActionStateMessage state={createState.message ? createState : undefined} />
          <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? "Adding..." : "Add person type"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Person types
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Lower display-order numbers appear first. Types containing contacts must be reassigned before they can be archived.
          </p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {contactTypes.map((contactType) => (
            <form
              key={contactType.id}
              action={updateAction}
              className={`grid gap-5 p-5 xl:grid-cols-[240px_minmax(0,1fr)] ${
                contactType.isActive ? "" : "bg-gray-50/80 dark:bg-white/[0.02]"
              }`}
            >
              <input type="hidden" name="id" value={contactType.id} />
              <input
                type="hidden"
                name="nextActive"
                value={contactType.isActive ? "false" : "true"}
              />
              <div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone={contactType.isActive ? "success" : "neutral"}>
                    {contactType.isActive ? "Active" : "Archived"}
                  </StatusPill>
                  {contactType.isDefault && <StatusPill tone="brand">Default</StatusPill>}
                  {contactType.systemKey && <StatusPill tone="neutral">System</StatusPill>}
                </div>
                <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-white/90">
                  {contactType.name}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {contactType.contactCount} contact{contactType.contactCount === 1 ? "" : "s"}
                </p>
                <p className="mt-1 break-all text-xs text-gray-400">{contactType.slug}</p>
              </div>
              <div className="space-y-4">
                <ContactTypeFields contactType={contactType} />
                <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                    >
                      Save changes
                    </button>
                    <button
                      type="submit"
                      formAction={toggleAction}
                      disabled={isToggling}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                    >
                      {contactType.isActive ? "Archive" : "Reactivate"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          ))}
        </div>
        <div className="border-t border-gray-100 p-4 dark:border-gray-800">
          <ActionStateMessage
            state={
              updateState.message
                ? updateState
                : toggleState.message
                  ? toggleState
                  : undefined
            }
          />
        </div>
      </section>
    </div>
  );
}

function ContactTypeFields({
  contactType,
  displayOrder,
}: {
  contactType?: ContactTypeManagerItem;
  displayOrder?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Singular label">
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={contactType?.name ?? ""}
            className={inputClassName}
          />
        </Field>
        <Field label="Plural label">
          <input
            name="pluralName"
            required
            maxLength={80}
            defaultValue={contactType?.pluralName ?? ""}
            className={inputClassName}
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          name="description"
          maxLength={240}
          defaultValue={contactType?.description ?? ""}
          className={textareaClassName}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Colour">
          <select
            name="colourKey"
            defaultValue={contactType?.colourKey ?? "gray"}
            className={inputClassName}
          >
            <option value="gray">Gray</option>
            <option value="success">Green</option>
            <option value="blue">Blue</option>
            <option value="purple">Purple</option>
            <option value="orange">Orange</option>
          </select>
        </Field>
        <Field label="Icon">
          <select
            name="iconKey"
            defaultValue={contactType?.iconKey ?? "user"}
            className={inputClassName}
          >
            <option value="user">Person</option>
            <option value="briefcase">Briefcase</option>
            <option value="wrench">Wrench</option>
            <option value="building">Building</option>
          </select>
        </Field>
        <Field label="Display order">
          <input
            name="displayOrder"
            type="number"
            min={0}
            max={9999}
            required
            defaultValue={contactType?.displayOrder ?? displayOrder ?? 10}
            className={inputClassName}
          />
        </Field>
        <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-gray-200 px-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={contactType?.isDefault ?? false}
            className="h-4 w-4 rounded border-gray-300 text-brand-500"
          />
          Default for new people
        </label>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "brand" | "neutral" | "success";
}) {
  const classes = {
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    neutral: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
    success: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>
      {children}
    </span>
  );
}
