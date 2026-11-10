import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import type { CompanyDocumentRequirementStatus } from "@/lib/companies/document-requirements";

export default function CompanyDocumentRequirements({
  requirements,
}: {
  requirements: CompanyDocumentRequirementStatus[];
}) {
  if (!requirements.length) return null;

  const required = requirements.filter((requirement) => requirement.isRequired);
  const completedRequired = required.filter(
    (requirement) => requirement.satisfied,
  ).length;

  return (
    <section className="mb-5 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Company document checklist
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            A requirement is completed when a private Company document is saved
            with the matching controlled document type.
          </p>
        </div>
        {required.length ? (
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${completedRequired === required.length ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"}`}
          >
            {completedRequired} of {required.length} required
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {requirements.map((requirement) => {
          const Icon = requirement.satisfied
            ? CheckCircle2
            : requirement.isRequired
              ? CircleAlert
              : CircleDashed;
          return (
            <div
              key={requirement.id}
              className="flex gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <Icon
                className={`mt-0.5 h-5 w-5 shrink-0 ${requirement.satisfied ? "text-success-500" : requirement.isRequired ? "text-warning-500" : "text-gray-400"}`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    {requirement.label}
                  </p>
                  <span className="text-[11px] font-semibold text-gray-400 uppercase">
                    {requirement.isRequired ? "Required" : "Optional"}
                  </span>
                </div>
                {requirement.description ? (
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {requirement.description}
                  </p>
                ) : null}
                <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {requirement.satisfied
                    ? `${requirement.matchingDocumentCount} matching document${requirement.matchingDocumentCount === 1 ? "" : "s"}`
                    : "Not received"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
