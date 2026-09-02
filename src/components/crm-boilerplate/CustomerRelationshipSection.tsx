"use client";

import {
  CalendarClock,
  Link2,
  type LucideIcon,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import {
  updateCustomerRelationshipAction,
  type CustomerRelationshipActionState,
} from "@/lib/actions/contacts";
import {
  customerRelationshipStatusOption,
  customerRelationshipStatusOptions,
  defaultCustomerRelationshipStatus,
  type CustomerRelationshipStatusValue,
} from "@/lib/customer-relationship";

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const textareaClassName =
  "min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

type TechnologyRow = {
  covered: boolean;
  id: string;
  installed: boolean;
  notes: string;
  opportunityId: string;
  technologyName: string;
};

export type CustomerRelationshipTechnology = {
  covered: boolean;
  id?: string;
  installed: boolean;
  notes: string | null;
  opportunityId: string | null;
  technologyName: string;
};

export type CustomerRelationshipOpportunityOption = {
  id: string;
  stageLabel: string;
  title: string;
  updatedLabel: string;
  valueLabel: string;
};

export type CustomerRelationshipSectionProps = {
  contactId: string;
  opportunityOptions: CustomerRelationshipOpportunityOption[];
  relationship: {
    nextReviewAt: string | null;
    notes: string | null;
    status: CustomerRelationshipStatusValue;
    summary: string | null;
    technologies: CustomerRelationshipTechnology[];
  };
};

function blankTechnologyRow(id = "new-0"): TechnologyRow {
  return {
    covered: false,
    id,
    installed: false,
    notes: "",
    opportunityId: "",
    technologyName: "",
  };
}

function newTechnologyRow(): TechnologyRow {
  return blankTechnologyRow(
    `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

function toTechnologyRow(
  technology: CustomerRelationshipTechnology,
): TechnologyRow {
  return {
    covered: technology.covered,
    id: technology.id ?? `existing-${technology.technologyName}`,
    installed: technology.installed,
    notes: technology.notes ?? "",
    opportunityId: technology.opportunityId ?? "",
    technologyName: technology.technologyName,
  };
}

export default function CustomerRelationshipSection({
  contactId,
  opportunityOptions,
  relationship,
}: CustomerRelationshipSectionProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<CustomerRelationshipStatusValue>(
    relationship.status ?? defaultCustomerRelationshipStatus,
  );
  const [rows, setRows] = useState<TechnologyRow[]>(() =>
    relationship.technologies.length
      ? relationship.technologies.map(toTechnologyRow)
      : [blankTechnologyRow()],
  );
  const [state, formAction, isPending] = useActionState<
    CustomerRelationshipActionState,
    FormData
  >(updateCustomerRelationshipAction, {
    ok: false,
    message: "",
  });

  const cleanRows = useMemo(
    () =>
      rows
        .map((row) => ({
          covered: row.covered,
          installed: row.installed,
          notes: row.notes.trim() || null,
          opportunityId: row.opportunityId || null,
          technologyName: row.technologyName.trim(),
        }))
        .filter((row) => row.technologyName),
    [rows],
  );
  const installedCount = cleanRows.filter((row) => row.installed).length;
  const coveredCount = cleanRows.filter((row) => row.covered).length;
  const linkedCount = cleanRows.filter((row) => row.opportunityId).length;
  const selectedStatusOption = customerRelationshipStatusOption(status);

  useEffect(() => {
    if (state.ok) {
      showToast(state.message || "Customer relationship saved.");
    }
  }, [showToast, state.message, state.ok]);

  function updateRow(rowId: string, update: Partial<TechnologyRow>) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...update } : row)),
    );
  }

  function removeRow(rowId: string) {
    setRows((current) =>
      current.length === 1
        ? [blankTechnologyRow()]
        : current.filter((row) => row.id !== rowId),
    );
  }

  return (
    <form action={formAction} className="space-y-5 p-4 sm:p-5">
      <input type="hidden" name="contactId" value={contactId} />
      <input
        type="hidden"
        name="technologies"
        value={JSON.stringify(cleanRows)}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Customer relationship
            </h2>
            <LazyHelpTooltip content="Tracks how this customer relates to EPC, what technologies are installed or covered, and which opportunities the work connects to." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Relationship status, installed technologies and current cover.
          </p>
        </div>
        <span
          className={`inline-flex h-7 w-fit items-center rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset ${selectedStatusOption.className}`}
        >
          {selectedStatusOption.label}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <RelationshipMetric
          Icon={Wrench}
          label="Installed"
          value={installedCount}
        />
        <RelationshipMetric
          Icon={ShieldCheck}
          label="Covered"
          value={coveredCount}
        />
        <RelationshipMetric Icon={Link2} label="Linked" value={linkedCount} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <Label htmlFor="customer-relationship-summary">
            Relationship summary
          </Label>
          <textarea
            id="customer-relationship-summary"
            name="summary"
            defaultValue={relationship.summary ?? ""}
            className={textareaClassName}
            placeholder="Current relationship, buying context or service cover."
          />
        </div>
        <div className="grid content-start gap-4">
          <div>
            <Label htmlFor="customer-relationship-status">Status</Label>
            <select
              id="customer-relationship-status"
              name="relationshipStatus"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as CustomerRelationshipStatusValue)
              }
              className={selectClassName}
            >
              {customerRelationshipStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {selectedStatusOption.description}
            </p>
          </div>
          <div>
            <Label htmlFor="customer-relationship-next-review">
              Next review
            </Label>
            <Input
              id="customer-relationship-next-review"
              name="nextReviewAt"
              type="date"
              defaultValue={relationship.nextReviewAt ?? ""}
            />
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-white/[0.02]">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Technologies installed and covered
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Opportunity context for service and sales handoff.
            </p>
          </div>
          <Button
            className="h-9 px-3 py-2"
            size="sm"
            type="button"
            variant="outline"
            startIcon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setRows((current) => [...current, newTechnologyRow()])
            }
          >
            Add technology
          </Button>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row) => (
            <TechnologyCoverageRow
              key={row.id}
              opportunityOptions={opportunityOptions}
              row={row}
              onRemove={() => removeRow(row.id)}
              onUpdate={(update) => updateRow(row.id, update)}
            />
          ))}
        </div>
      </section>

      <div>
        <Label htmlFor="customer-relationship-notes">Relationship notes</Label>
        <textarea
          id="customer-relationship-notes"
          name="notes"
          defaultValue={relationship.notes ?? ""}
          className={textareaClassName}
          placeholder="Internal notes, preferences, risks or follow-up context."
        />
      </div>

      <ActionStateMessage state={state.message ? state : undefined} />

      <div className="flex justify-end">
        <Button disabled={isPending} size="sm">
          {isPending ? "Saving..." : "Save relationship"}
        </Button>
      </div>
    </form>
  );
}

function RelationshipMetric({
  Icon,
  label,
  value,
}: {
  Icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-white">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function TechnologyCoverageRow({
  opportunityOptions,
  onRemove,
  onUpdate,
  row,
}: {
  opportunityOptions: CustomerRelationshipOpportunityOption[];
  onRemove: () => void;
  onUpdate: (update: Partial<TechnologyRow>) => void;
  row: TechnologyRow;
}) {
  return (
    <div className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(170px,1.1fr)_180px_180px_minmax(170px,1fr)_40px] xl:items-start">
      <div>
        <Label className="text-xs" htmlFor={`technology-name-${row.id}`}>
          Technology
        </Label>
        <Input
          id={`technology-name-${row.id}`}
          value={row.technologyName}
          onChange={(event) => onUpdate({ technologyName: event.target.value })}
          placeholder="Solar PV, battery, heat pump"
        />
      </div>
      <div>
        <p className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-400">
          Relationship
        </p>
        <div className="flex h-11 items-center gap-4 rounded-lg border border-gray-300 bg-transparent px-3 text-sm shadow-theme-xs dark:border-gray-700 dark:bg-gray-900">
          <label className="inline-flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={row.installed}
              onChange={(event) =>
                onUpdate({ installed: event.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
            />
            Installed
          </label>
        </div>
      </div>
      <div>
        <p className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-400">
          Cover
        </p>
        <div className="flex h-11 items-center gap-4 rounded-lg border border-gray-300 bg-transparent px-3 text-sm shadow-theme-xs dark:border-gray-700 dark:bg-gray-900">
          <label className="inline-flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={row.covered}
              onChange={(event) => onUpdate({ covered: event.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
            />
            Covered
          </label>
        </div>
      </div>
      <div>
        <Label className="text-xs" htmlFor={`technology-opportunity-${row.id}`}>
          Opportunity
        </Label>
        <select
          id={`technology-opportunity-${row.id}`}
          value={row.opportunityId}
          onChange={(event) => onUpdate({ opportunityId: event.target.value })}
          className={selectClassName}
        >
          <option value="">No opportunity link</option>
          {opportunityOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title} - {option.stageLabel} - {option.valueLabel}
            </option>
          ))}
        </select>
        {row.opportunityId ? (
          <TechnologyOpportunityMeta
            opportunity={opportunityOptions.find(
              (option) => option.id === row.opportunityId,
            )}
          />
        ) : null}
      </div>
      <div className="flex items-end xl:h-[68px]">
        <button
          type="button"
          onClick={onRemove}
          className="inline-grid h-10 w-10 place-items-center rounded-lg border border-gray-300 text-gray-500 transition hover:bg-gray-50 hover:text-error-600 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-error-300"
          aria-label="Remove technology"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="xl:col-span-5">
        <Label className="text-xs" htmlFor={`technology-notes-${row.id}`}>
          Notes
        </Label>
        <Input
          id={`technology-notes-${row.id}`}
          value={row.notes}
          onChange={(event) => onUpdate({ notes: event.target.value })}
          placeholder="Warranty, cover notes, service risk or next action."
        />
      </div>
    </div>
  );
}

function TechnologyOpportunityMeta({
  opportunity,
}: {
  opportunity: CustomerRelationshipOpportunityOption | undefined;
}) {
  if (!opportunity) return null;

  return (
    <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <CalendarClock className="h-3.5 w-3.5" />
      Updated {opportunity.updatedLabel}
    </p>
  );
}
