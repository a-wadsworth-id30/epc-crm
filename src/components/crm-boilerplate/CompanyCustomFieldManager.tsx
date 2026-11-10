"use client";

import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  createCompanyTypeFieldAction,
  toggleCompanyTypeFieldAction,
  updateCompanyTypeFieldAction,
  type CompanyTypeFieldActionState,
} from "@/lib/actions/company-type-fields";
import { userRoleTemplates } from "@/lib/users/role-templates";

type CompanyType = { id: string; name: string; isActive: boolean };

export type CompanyCustomFieldManagerItem = {
  id: string;
  companyTypeId: string;
  companyTypeName: string;
  key: string;
  label: string;
  helpText: string | null;
  placeholder: string | null;
  fieldType: string;
  requirementMode: string;
  options: string[];
  displayOrder: number;
  isActive: boolean;
  showInTable: boolean;
  isSearchable: boolean;
  externalEditable: boolean;
  valueCount: number;
  viewRoleTemplates: string[];
  editRoleTemplates: string[];
};

const initialState: CompanyTypeFieldActionState = { ok: false, message: "", savedAt: null };
const inputClassName = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const textareaClassName = `${inputClassName} min-h-20 py-2`;
const fieldTypes = [
  ["SHORT_TEXT", "Short text"], ["LONG_TEXT", "Long text"], ["NUMBER", "Number"], ["DATE", "Date"], ["BOOLEAN", "Yes / No"], ["SINGLE_SELECT", "Single select"], ["MULTI_SELECT", "Multi select"], ["EMAIL", "Email"], ["PHONE", "Telephone"], ["URL", "Website URL"], ["ADDRESS", "Address"],
] as const;

export default function CompanyCustomFieldManager({ companyTypes, fields, nextDisplayOrder }: { companyTypes: CompanyType[]; fields: CompanyCustomFieldManagerItem[]; nextDisplayOrder: number }) {
  const { showToast } = useToast();
  const [createState, createAction, isCreating] = useActionState(createCompanyTypeFieldAction, initialState);
  const [updateState, updateAction, isUpdating] = useActionState(updateCompanyTypeFieldAction, initialState);
  const [toggleState, toggleAction, isToggling] = useActionState(toggleCompanyTypeFieldAction, initialState);

  useEffect(() => { if (createState.message) showToast(createState.message, createState.ok ? "success" : "error"); }, [createState, showToast]);
  useEffect(() => { if (updateState.message) showToast(updateState.message, updateState.ok ? "success" : "error"); }, [showToast, updateState]);
  useEffect(() => { if (toggleState.message) showToast(toggleState.message, toggleState.ok ? "success" : "error"); }, [showToast, toggleState]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Type-specific company fields</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Define structured information for each company type. Field identifiers remain stable when labels change.</p>
        <form action={createAction} className="mt-5 space-y-4 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
          <FieldEditor companyTypes={companyTypes} displayOrder={nextDisplayOrder} />
          <ActionStateMessage state={createState.message ? createState : undefined} />
          <div className="flex justify-end"><button type="submit" disabled={isCreating} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{isCreating ? "Adding..." : "Add field"}</button></div>
        </form>
      </div>

      {fields.length ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {fields.map((field) => (
            <form key={field.id} action={updateAction} className="grid gap-4 p-5 xl:grid-cols-[220px_minmax(0,1fr)]">
              <input type="hidden" name="fieldId" value={field.id} />
              <input type="hidden" name="companyTypeId" value={field.companyTypeId} />
              <input type="hidden" name="nextActive" value={field.isActive ? "false" : "true"} />
              <div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-brand-50 px-2 py-1 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{field.companyTypeName}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-white/10 dark:text-gray-300">{field.isActive ? "Active" : "Archived"}</span>
                </div>
                <p className="mt-3 font-semibold text-gray-800 dark:text-white/90">{field.label}</p>
                <p className="mt-1 text-xs text-gray-400">{field.key}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.valueCount} saved value{field.valueCount === 1 ? "" : "s"}</p>
              </div>
              <div className="space-y-4">
                <FieldEditor companyTypes={companyTypes} field={field} />
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <button type="submit" disabled={isUpdating} className="h-9 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">Save field</button>
                  <button type="submit" formAction={toggleAction} disabled={isToggling} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300 disabled:opacity-60">{field.isActive ? "Archive" : "Reactivate"}</button>
                </div>
              </div>
            </form>
          ))}
        </div>
      ) : <p className="p-5 text-sm text-gray-500 dark:text-gray-400">No company custom fields have been configured.</p>}
      <div className="border-t border-gray-100 p-4 dark:border-gray-800"><ActionStateMessage state={updateState.message ? updateState : toggleState.message ? toggleState : undefined} /></div>
    </section>
  );
}

function FieldEditor({ companyTypes, field, displayOrder }: { companyTypes: CompanyType[]; field?: CompanyCustomFieldManagerItem; displayOrder?: number }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Company type">
          <select name="companyTypeId" defaultValue={field?.companyTypeId ?? companyTypes.find((type) => type.isActive)?.id} disabled={Boolean(field)} className={inputClassName} required>
            {companyTypes.map((type) => <option key={type.id} value={type.id}>{type.name}{type.isActive ? "" : " (archived)"}</option>)}
          </select>
        </Field>
        <Field label="Field label"><input name="label" defaultValue={field?.label ?? ""} maxLength={100} className={inputClassName} required /></Field>
        <Field label="Field type"><select name="fieldType" defaultValue={field?.fieldType ?? "SHORT_TEXT"} className={inputClassName}>{fieldTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Requirement"><select name="requirementMode" defaultValue={field?.requirementMode ?? "OPTIONAL"} className={inputClassName}><option value="OPTIONAL">Optional</option><option value="COMPLETENESS">Required for completeness</option><option value="REQUIRED">Required to save</option></select></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Help text"><textarea name="helpText" defaultValue={field?.helpText ?? ""} maxLength={240} className={textareaClassName} /></Field>
        <Field label="Select options (comma or line separated)"><textarea name="optionsText" defaultValue={field?.options.join("\n") ?? ""} className={textareaClassName} placeholder={"Option one\nOption two"} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Placeholder"><input name="placeholder" defaultValue={field?.placeholder ?? ""} maxLength={120} className={inputClassName} /></Field>
        <Field label="Display order"><input name="displayOrder" type="number" min={0} max={9999} defaultValue={field?.displayOrder ?? displayOrder ?? 10} className={inputClassName} required /></Field>
        <Check name="showInTable" label="Available as table column" checked={field?.showInTable} />
        <Check name="isSearchable" label="Include in search" checked={field?.isSearchable} />
        <Check name="externalEditable" label="External forms may edit" checked={field?.externalEditable} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <RoleChecks name="viewRoleTemplates" label="Roles that can view" selected={field?.viewRoleTemplates} />
        <RoleChecks name="editRoleTemplates" label="Roles that can edit" selected={field?.editRoleTemplates} />
      </div>
    </div>
  );
}

function RoleChecks({ name, label, selected = [] }: { name: string; label: string; selected?: string[] }) {
  return (
    <fieldset className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</legend>
      <p className="mb-2 text-xs text-gray-500">Leave all unchecked to allow every role. Administrators always have access.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {userRoleTemplates.filter((role) => role.baseRole === "USER").map((role) => <label key={role.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" name={name} value={role.key} defaultChecked={selected.includes(role.key)} className="h-4 w-4 rounded border-gray-300 text-brand-500" />{role.label}</label>)}
      </div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium text-gray-700 dark:text-gray-300"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Check({ name, label, checked }: { name: string; label: string; checked?: boolean }) { return <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-gray-200 px-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300"><input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4 rounded border-gray-300 text-brand-500" />{label}</label>; }
