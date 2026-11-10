"use client";

import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  createContactDocumentRequirementAction,
  toggleContactDocumentRequirementAction,
  updateContactDocumentRequirementAction,
  type ContactDocumentRequirementActionState,
} from "@/lib/actions/contact-document-requirements";
import { documentUploadTypeDefinitions } from "@/lib/document-library";

type PersonType = { id: string; isActive: boolean; name: string };

export type ContactDocumentRequirementManagerItem = {
  contactTypeId: string;
  contactTypeName: string;
  description: string | null;
  displayOrder: number;
  id: string;
  isActive: boolean;
  isRequired: boolean;
  label: string;
  uploadType: string;
};

const initialState: ContactDocumentRequirementActionState = {
  message: "",
  ok: false,
  savedAt: null,
};
const inputClassName =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function ContactDocumentRequirementManager({
  contactTypes,
  nextDisplayOrder,
  requirements,
}: {
  contactTypes: PersonType[];
  nextDisplayOrder: number;
  requirements: ContactDocumentRequirementManagerItem[];
}) {
  const { showToast } = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createContactDocumentRequirementAction,
    initialState,
  );
  const [updateState, updateAction, isUpdating] = useActionState(
    updateContactDocumentRequirementAction,
    initialState,
  );
  const [toggleState, toggleAction, isToggling] = useActionState(
    toggleContactDocumentRequirementAction,
    initialState,
  );

  useEffect(() => {
    if (createState.message) showToast(createState.message, createState.ok ? "success" : "error");
  }, [createState, showToast]);
  useEffect(() => {
    if (updateState.message) showToast(updateState.message, updateState.ok ? "success" : "error");
  }, [showToast, updateState]);
  useEffect(() => {
    if (toggleState.message) showToast(toggleState.message, toggleState.ok ? "success" : "error");
  }, [showToast, toggleState]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Document requirements
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Define the controlled document types expected for each person type. Existing private record documents are matched by their saved document type.
        </p>
        <form action={createAction} className="mt-5 space-y-4 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
          <RequirementEditor
            contactTypes={contactTypes}
            displayOrder={nextDisplayOrder}
          />
          <ActionStateMessage state={createState.message ? createState : undefined} />
          <div className="flex justify-end">
            <button type="submit" disabled={isCreating} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              {isCreating ? "Adding..." : "Add requirement"}
            </button>
          </div>
        </form>
      </div>

      {requirements.length ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {requirements.map((requirement) => (
            <form key={requirement.id} action={updateAction} className="grid gap-4 p-5 xl:grid-cols-[220px_minmax(0,1fr)]">
              <input type="hidden" name="requirementId" value={requirement.id} />
              <input type="hidden" name="contactTypeId" value={requirement.contactTypeId} />
              <input type="hidden" name="uploadType" value={requirement.uploadType} />
              <input type="hidden" name="nextActive" value={requirement.isActive ? "false" : "true"} />
              <div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-brand-50 px-2 py-1 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{requirement.contactTypeName}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-white/10 dark:text-gray-300">{requirement.isActive ? "Active" : "Archived"}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-white/10 dark:text-gray-300">{requirement.isRequired ? "Required" : "Optional"}</span>
                </div>
                <p className="mt-3 font-semibold text-gray-800 dark:text-white/90">{requirement.label}</p>
                <p className="mt-1 text-xs text-gray-400">{requirement.uploadType}</p>
              </div>
              <div className="space-y-4">
                <RequirementEditor contactTypes={contactTypes} requirement={requirement} />
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <button type="submit" disabled={isUpdating} className="h-9 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">Save requirement</button>
                  <button type="submit" formAction={toggleAction} disabled={isToggling} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300">
                    {requirement.isActive ? "Archive" : "Reactivate"}
                  </button>
                </div>
              </div>
            </form>
          ))}
        </div>
      ) : (
        <p className="p-5 text-sm text-gray-500 dark:text-gray-400">No document requirements have been configured.</p>
      )}
      <div className="border-t border-gray-100 p-4 dark:border-gray-800">
        <ActionStateMessage state={updateState.message ? updateState : toggleState.message ? toggleState : undefined} />
      </div>
    </section>
  );
}

function RequirementEditor({
  contactTypes,
  displayOrder,
  requirement,
}: {
  contactTypes: PersonType[];
  displayOrder?: number;
  requirement?: ContactDocumentRequirementManagerItem;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Field label="Person type">
        <select name="contactTypeId" defaultValue={requirement?.contactTypeId ?? contactTypes.find((type) => type.isActive)?.id} disabled={Boolean(requirement)} className={inputClassName} required>
          {contactTypes.map((type) => <option key={type.id} value={type.id}>{type.name}{type.isActive ? "" : " (archived)"}</option>)}
        </select>
      </Field>
      <Field label="Document type">
        <select name="uploadType" defaultValue={requirement?.uploadType ?? documentUploadTypeDefinitions[0].key} disabled={Boolean(requirement)} className={inputClassName} required>
          {documentUploadTypeDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}
        </select>
      </Field>
      <Field label="Visible label">
        <input name="label" defaultValue={requirement?.label ?? ""} maxLength={120} placeholder="Uses document type label" className={inputClassName} />
      </Field>
      <Field label="Display order">
        <input name="displayOrder" type="number" min={0} max={9999} defaultValue={requirement?.displayOrder ?? displayOrder ?? 10} className={inputClassName} required />
      </Field>
      <div className="md:col-span-2 lg:col-span-3">
        <Field label="Instructions">
          <input name="description" defaultValue={requirement?.description ?? ""} maxLength={500} placeholder="Explain what is acceptable" className={inputClassName} />
        </Field>
      </div>
      <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-gray-200 px-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
        <input type="checkbox" name="isRequired" defaultChecked={requirement?.isRequired ?? true} className="h-4 w-4 rounded border-gray-300 text-brand-500" />
        Required for this person type
      </label>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-gray-700 dark:text-gray-300"><span className="mb-1.5 block">{label}</span>{children}</label>;
}
