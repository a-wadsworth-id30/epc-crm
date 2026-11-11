"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  updateCompanyParentAction,
  type CompanyActionState,
} from "@/lib/actions/companies";

type CompanyOption = {
  id: string;
  name: string;
};

const initialState: CompanyActionState = { ok: false, message: "" };

export default function CompanyHierarchyEditor({
  childCompanies,
  companyId,
  companyOptions,
  hasRestrictedParent,
  parentCompany,
}: {
  childCompanies: CompanyOption[];
  companyId: string;
  companyOptions: CompanyOption[];
  hasRestrictedParent: boolean;
  parentCompany: CompanyOption | null;
}) {
  const { showToast } = useToast();
  const [state, action, isPending] = useActionState(
    updateCompanyParentAction,
    initialState,
  );

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message, state.ok ? "success" : "error");
  }, [showToast, state]);

  return (
    <section className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          Organisation structure
        </h3>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
          Optionally link this record to a head office or group Company. People
          and sales records remain attached to their existing Company.
        </p>
      </div>

      <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="companyId" value={companyId} />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`parent-company-${companyId}`}
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Parent Company
          </label>
          <select
            id={`parent-company-${companyId}`}
            name="parentCompanyId"
            defaultValue={
              parentCompany?.id ?? (hasRestrictedParent ? "restricted" : "")
            }
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">Independent Company</option>
            {hasRestrictedParent ? (
              <option value="restricted" disabled>
                Restricted parent Company
              </option>
            ) : null}
            {companyOptions.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save structure"}
        </button>
      </form>
      <div className="mt-2">
        <ActionStateMessage state={state.message ? state : undefined} />
      </div>

      <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Reports to</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {parentCompany ? (
              <Link
                href={`/clients/${parentCompany.id}`}
                className="text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                {parentCompany.name}
              </Link>
            ) : hasRestrictedParent ? (
              "Restricted parent Company"
            ) : (
              "Independent Company"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">
            Branches and subsidiaries
          </dt>
          <dd className="mt-1">
            {childCompanies.length ? (
              <ul className="space-y-1">
                {childCompanies.map((company) => (
                  <li key={company.id}>
                    <Link
                      href={`/clients/${company.id}`}
                      className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                    >
                      {company.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="font-medium text-gray-800 dark:text-white/90">
                None linked
              </span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
