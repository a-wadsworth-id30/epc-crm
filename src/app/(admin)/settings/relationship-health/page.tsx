import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import ServerPagination from "@/components/crm-boilerplate/ServerPagination";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/formatters/date";
import {
  parsePageSize,
  parsePositiveInteger,
} from "@/lib/navigation/pagination";
import { prisma } from "@/lib/prisma";
import {
  filterRelationshipHealthRows,
  relationshipHealthRows,
  relationshipHealthSummary,
} from "@/lib/sales/relationship-health";
import {
  saleRelationshipFindingCodes,
  type SaleRelationshipFindingCode,
} from "@/lib/sales/relationship-integrity";

export const metadata: Metadata = {
  title: "Relationship Health | iD30 CRM",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const scanLimit = 5_000;
const pageSizes = [10, 25, 50] as const;
const issueLabels: Record<SaleRelationshipFindingCode, string> = {
  MISSING_PRIMARY_PERSON: "Missing primary Person",
  PRIMARY_PARTICIPANT_MISMATCH: "Primary participant mismatch",
  MISSING_SALE_COMPANY: "Missing Sale Company",
  PRIMARY_PERSON_COMPANY_MISMATCH: "Person and Sale Companies differ",
  PRIMARY_PERSON_COMPANY_MISSING: "Person has no Company",
  MULTI_COMPANY_PARTICIPANTS: "Participants span Companies",
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isFindingCode(
  value: string | undefined,
): value is SaleRelationshipFindingCode {
  return saleRelationshipFindingCodes.some((code) => code === value);
}

export default async function RelationshipHealthPage({
  searchParams,
}: PageProps) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const requestedCode = single(params.code);
  const code = isFindingCode(requestedCode) ? requestedCode : undefined;
  const requestedSeverity = single(params.severity);
  const severity =
    requestedSeverity === "warning" || requestedSeverity === "review"
      ? requestedSeverity
      : undefined;
  const scope = single(params.scope) === "all" ? "all" : "active";
  const pageSize = parsePageSize({
    fallback: 25,
    options: pageSizes,
    value: params.pageSize,
  });
  const requestedPage = parsePositiveInteger(single(params.page), 1);

  const sales = await prisma.salesOpportunity.findMany({
    where:
      scope === "active"
        ? {
            stage: { notIn: ["WON", "LOST"] },
            OR: [
              { salesPipelineStageId: null },
              { salesPipelineStage: { isClosed: false } },
            ],
          }
        : undefined,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: scanLimit + 1,
    select: {
      company: { select: { id: true, name: true } },
      id: true,
      owner: { select: { id: true, name: true } },
      participants: {
        select: {
          contact: {
            select: {
              companyAffiliations: { select: { companyId: true } },
              companyId: true,
              id: true,
            },
          },
          role: true,
        },
      },
      contact: {
        select: {
          company: { select: { id: true, name: true } },
          companyAffiliations: { select: { companyId: true } },
          companyId: true,
          firstName: true,
          id: true,
          lastName: true,
        },
      },
      salesPipelineStage: { select: { name: true } },
      stage: true,
      title: true,
      updatedAt: true,
    },
  });
  const truncated = sales.length > scanLimit;
  const scannedSales = sales.slice(0, scanLimit).map((sale) => ({
    ...sale,
    primaryPerson: sale.contact,
  }));
  const allRows = relationshipHealthRows(scannedSales);
  const summary = relationshipHealthSummary(allRows);
  const filteredRows = filterRelationshipHealthRows(allRows, {
    code,
    severity,
  });
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageHeader
        title="Relationship Health"
        description="Review Sales where the primary Person, participant and Company links need attention. Repairs remain deliberate on the Sale record."
        actions={
          <Link
            href="/sales"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Open Sales
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Sales reviewed" value={scannedSales.length} />
        <SummaryCard label="Sales needing attention" value={summary.sales} />
        <SummaryCard label="Warnings" value={summary.warning} tone="warning" />
        <SummaryCard
          label="Review items"
          value={summary.review}
          tone="review"
        />
      </div>

      {truncated ? (
        <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-200">
          This view checks the {scanLimit.toLocaleString("en-GB")} most recently
          updated {scope === "active" ? "active " : ""}Sales. Narrow the
          operational backlog before relying on this as a complete historical
          audit.
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 lg:flex-row lg:items-end lg:justify-between dark:border-gray-800">
          <form className="grid flex-1 gap-3 sm:grid-cols-3" method="get">
            <FilterField label="Scope" name="scope" defaultValue={scope}>
              <option value="active">Active Sales</option>
              <option value="all">All Sales</option>
            </FilterField>
            <FilterField label="Issue" name="code" defaultValue={code ?? ""}>
              <option value="">All issues</option>
              {saleRelationshipFindingCodes.map((value) => (
                <option key={value} value={value}>
                  {issueLabels[value]}
                </option>
              ))}
            </FilterField>
            <FilterField
              label="Severity"
              name="severity"
              defaultValue={severity ?? ""}
            >
              <option value="">All severities</option>
              <option value="warning">Warning</option>
              <option value="review">Review</option>
            </FilterField>
            {pageSize !== 25 ? (
              <input type="hidden" name="pageSize" value={pageSize} />
            ) : null}
            <div className="flex gap-2 sm:col-span-3">
              <button
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
                type="submit"
              >
                Apply filters
              </button>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                href="/settings/relationship-health"
              >
                Clear
              </Link>
            </div>
          </form>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filteredRows.length} Sale{filteredRows.length === 1 ? "" : "s"}{" "}
            match
          </p>
        </div>

        {rows.length ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((sale) => (
              <article key={sale.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="font-semibold text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-300"
                      >
                        {sale.title}
                      </Link>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                        {sale.salesPipelineStage?.name ?? sale.stage}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {sale.primaryPerson
                        ? `${sale.primaryPerson.firstName} ${sale.primaryPerson.lastName}`.trim()
                        : "No primary Person"}{" "}
                      · {sale.company?.name ?? "No Sale Company"} ·{" "}
                      {sale.owner?.name ?? "Unassigned"}
                    </p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      Updated {formatDateTime(sale.updatedAt)}
                    </p>
                  </div>
                  <Link
                    href={`/sales/${sale.id}`}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                  >
                    Review Sale
                  </Link>
                </div>
                <div className="mt-4 grid gap-2 lg:grid-cols-2">
                  {sale.findings
                    .filter(
                      (finding) =>
                        (!code || finding.code === code) &&
                        (!severity || finding.severity === severity),
                    )
                    .map((finding) => (
                      <div
                        key={finding.code}
                        className={`rounded-xl border px-3 py-3 ${finding.severity === "warning" ? "border-warning-200 bg-warning-50/70 dark:border-warning-500/20 dark:bg-warning-500/10" : "border-blue-light-200 bg-blue-light-50/70 dark:border-blue-light-500/20 dark:bg-blue-light-500/10"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                            {finding.title}
                          </p>
                          <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                            {finding.severity}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
                          {finding.detail}
                        </p>
                      </div>
                    ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="font-medium text-gray-800 dark:text-white/90">
              No relationship issues found
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              The Sales in this scope have consistent primary Person,
              participant and Company links.
            </p>
          </div>
        )}

        <ServerPagination
          basePath="/settings/relationship-health"
          page={page}
          pageSize={pageSize}
          pageSizeOptions={[...pageSizes]}
          params={{ code, scope: scope === "active" ? null : scope, severity }}
          totalCount={filteredRows.length}
        />
      </div>
    </>
  );
}

function SummaryCard({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "review" | "warning";
  value: number;
}) {
  const valueClass =
    tone === "warning"
      ? "text-warning-600 dark:text-warning-300"
      : tone === "review"
        ? "text-blue-light-600 dark:text-blue-light-300"
        : "text-gray-800 dark:text-white/90";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>
        {value.toLocaleString("en-GB")}
      </p>
    </div>
  );
}

function FilterField({
  children,
  defaultValue,
  label,
  name,
}: {
  children: React.ReactNode;
  defaultValue: string;
  label: string;
  name: string;
}) {
  return (
    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
      >
        {children}
      </select>
    </label>
  );
}
