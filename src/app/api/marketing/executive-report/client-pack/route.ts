import { requireAdmin } from "@/lib/auth";
import {
  getMarketingOpportunityTotals,
  type MarketingOpportunityTotals,
} from "@/lib/marketing/opportunity-totals";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type MarketingRange = "7d" | "30d" | "90d" | "12m" | "all";

type LifecycleFunnelRow = {
  conversionRate: number | null;
  count: number;
  detail: string;
  key: string;
  label: string;
  valueCents: number | null;
};

type SourceRow = {
  closeRate: number | null;
  latest: Date | null;
  leads: number;
  openPipelineCents: number;
  proposals: number;
  qualified: number;
  source: string;
  weightedPipelineCents: number;
  wonCents: number;
  wonDeals: number;
};

type SalesQualityRow = {
  contacted: number;
  contactedRate: number | null;
  leads: number;
  openPipelineCents: number;
  ownerName: string;
  proposals: number;
  qualified: number;
  qualityScore: number;
  source: string;
  weightedPipelineCents: number;
  wonCents: number;
  wonDeals: number;
};

type ExecutiveOpportunity = Awaited<ReturnType<typeof fetchExecutiveOpportunities>>[number];

const rangeOptions: Record<MarketingRange, { days: number | null; label: string }> = {
  "7d": { days: 7, label: "Last 7 days" },
  "30d": { days: 30, label: "Last 30 days" },
  "90d": { days: 90, label: "Last 90 days" },
  "12m": { days: 365, label: "Last 12 months" },
  all: { days: null, label: "All time" },
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const activeRange = parseMarketingRange(url.searchParams.get("range"));
  const activeWindow = marketingRangeWindow(activeRange);
  const activeDateWhere = activeWindow.startDate
    ? { gte: activeWindow.startDate, lte: activeWindow.endDate }
    : undefined;
  const [opportunityTotals, opportunities, sessionCount, campaignSpendSummary] = await Promise.all([
    getMarketingOpportunityTotals(activeDateWhere),
    fetchExecutiveOpportunities(activeDateWhere),
    prisma.attributionSnapshot.count({
      where: activeDateWhere ? { updatedAt: activeDateWhere } : undefined,
    }),
    prisma.marketingCampaignSpend.aggregate({
      where: activeDateWhere ? { date: activeDateWhere } : undefined,
      _sum: {
        costMicros: true,
      },
    }),
  ]);

  const totalLeads = opportunityTotals.totalLeads;
  const attributedLeads = opportunityTotals.attributedLeads;
  const totalSpendCents = microsToCents(campaignSpendSummary._sum.costMicros);
  const wonRevenueCents = opportunityTotals.wonRevenueCents;
  const lifecycleRows = buildLifecycleFunnelRows({
    sessions: sessionCount,
    totals: opportunityTotals,
  });
  const sourceRows = buildSourceRows(opportunities).slice(0, 5);
  const salesQualityRows = buildSalesQualityRows(opportunities).slice(0, 5);
  const html = renderClientPackHtml({
    activeRange,
    attributedLeads,
    generatedAt: new Date(),
    lifecycleRows,
    rangeLabel: activeWindow.label,
    salesQualityRows,
    sourceRows,
    totalLeads,
    totalSpendCents,
    wonRevenueCents,
  });

  return new Response(html, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="id30-executive-report-${activeRange}-${new Date().toISOString().slice(0, 10)}.html"`,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function parseMarketingRange(value: string | null): MarketingRange {
  return value === "7d" || value === "90d" || value === "12m" || value === "all"
    ? value
    : "30d";
}

function marketingRangeWindow(range: MarketingRange) {
  const option = rangeOptions[range];
  const endDate = new Date();

  if (option.days === null) {
    return {
      ...option,
      endDate,
      startDate: null,
    };
  }

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - option.days + 1);
  startDate.setHours(0, 0, 0, 0);

  return {
    ...option,
    endDate,
    startDate,
  };
}

function fetchExecutiveOpportunities(
  activeDateWhere: { gte: Date; lte: Date } | undefined,
) {
  return prisma.salesOpportunity.findMany({
    where: activeDateWhere ? { createdAt: activeDateWhere } : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      attribution: true,
      communications: {
        orderBy: { occurredAt: "asc" },
        select: { occurredAt: true },
        take: 1,
        where: { direction: "OUTBOUND" },
      },
      createdAt: true,
      firstContactedAt: true,
      owner: {
        select: {
          firstName: true,
          lastName: true,
          name: true,
        },
      },
      probability: true,
      source: true,
      stage: true,
      valueCents: true,
    },
  });
}

function microsToCents(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) / 10_000);
}

function formatMoney(valueCents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(valueCents / 100);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Not available";
  return `${value.toFixed(1)}x`;
}

function percentOf(value: number, total: number) {
  if (total <= 0) return null;
  return (value / total) * 100;
}

const lifecycleStageRank: Record<string, number> = {
  LEAD: 1,
  LOST: 0,
  NEGOTIATION: 4,
  PROPOSAL: 3,
  QUALIFIED: 2,
  WON: 5,
};

function isAtLeastLifecycleStage(stage: string, target: string) {
  return (lifecycleStageRank[stage] ?? 0) >= (lifecycleStageRank[target] ?? 0);
}

function buildLifecycleFunnelRows({
  sessions,
  totals,
}: {
  sessions: number;
  totals: MarketingOpportunityTotals;
}): LifecycleFunnelRow[] {
  const rows = [
    {
      count: sessions,
      detail: "Tracked visitor sessions",
      key: "sessions",
      label: "Sessions",
      valueCents: null,
    },
    {
      count: totals.totalLeads,
      detail: "CRM opportunities created",
      key: "leads",
      label: "Leads",
      valueCents: null,
    },
    {
      count: totals.qualifiedLeads,
      detail: "Qualified, proposal, negotiation or won",
      key: "qualified",
      label: "Qualified pipeline",
      valueCents: totals.qualifiedValueCents,
    },
    {
      count: totals.proposalCount,
      detail: "Proposal, negotiation or won",
      key: "proposals",
      label: "Proposals",
      valueCents: totals.proposalValueCents,
    },
    {
      count: totals.wonDeals,
      detail: "Closed won revenue",
      key: "won",
      label: "Won deals",
      valueCents: totals.wonRevenueCents,
    },
  ];

  return rows.map((row, index) => {
    const previous = rows[index - 1];
    return {
      ...row,
      conversionRate: previous && previous.count > 0 ? (row.count / previous.count) * 100 : null,
    };
  });
}

function buildSourceRows(opportunities: ExecutiveOpportunity[]): SourceRow[] {
  const rows = new Map<string, SourceRow>();

  for (const opportunity of opportunities) {
    const source = opportunity.source || sourceFromAttribution(opportunity.attribution);
    const current = rows.get(source) ?? {
      closeRate: null,
      latest: null,
      leads: 0,
      openPipelineCents: 0,
      proposals: 0,
      qualified: 0,
      source,
      weightedPipelineCents: 0,
      wonCents: 0,
      wonDeals: 0,
    };

    current.leads += 1;

    if (isAtLeastLifecycleStage(opportunity.stage, "QUALIFIED")) {
      current.qualified += 1;
    }

    if (isAtLeastLifecycleStage(opportunity.stage, "PROPOSAL")) {
      current.proposals += 1;
    }

    if (opportunity.stage === "WON") {
      current.wonDeals += 1;
      current.wonCents += opportunity.valueCents;
    } else if (opportunity.stage !== "LOST") {
      current.openPipelineCents += opportunity.valueCents;
      current.weightedPipelineCents += Math.round(
        (opportunity.valueCents * opportunity.probability) / 100,
      );
    }

    current.latest =
      !current.latest || opportunity.createdAt > current.latest
        ? opportunity.createdAt
        : current.latest;
    rows.set(source, current);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      closeRate: percentOf(row.wonDeals, row.qualified),
    }))
    .sort(
      (a, b) =>
        b.wonCents - a.wonCents ||
        b.weightedPipelineCents - a.weightedPipelineCents ||
        b.qualified - a.qualified ||
        b.leads - a.leads ||
        a.source.localeCompare(b.source),
    );
}

function buildSalesQualityRows(opportunities: ExecutiveOpportunity[]): SalesQualityRow[] {
  const rows = new Map<string, SalesQualityRow>();

  for (const opportunity of opportunities) {
    const source = opportunity.source || sourceFromAttribution(opportunity.attribution);
    const ownerName = ownerLabel(opportunity.owner);
    const key = `${source}::${ownerName}`;
    const current = rows.get(key) ?? {
      contacted: 0,
      contactedRate: null,
      leads: 0,
      openPipelineCents: 0,
      ownerName,
      proposals: 0,
      qualified: 0,
      qualityScore: 0,
      source,
      weightedPipelineCents: 0,
      wonCents: 0,
      wonDeals: 0,
    };

    current.leads += 1;

    if (opportunity.firstContactedAt || opportunity.communications.length > 0) {
      current.contacted += 1;
    }

    if (isAtLeastLifecycleStage(opportunity.stage, "QUALIFIED")) {
      current.qualified += 1;
    }

    if (isAtLeastLifecycleStage(opportunity.stage, "PROPOSAL")) {
      current.proposals += 1;
    }

    if (opportunity.stage === "WON") {
      current.wonDeals += 1;
      current.wonCents += opportunity.valueCents;
    } else if (opportunity.stage !== "LOST") {
      current.openPipelineCents += opportunity.valueCents;
      current.weightedPipelineCents += Math.round(
        (opportunity.valueCents * opportunity.probability) / 100,
      );
    }

    rows.set(key, current);
  }

  return Array.from(rows.values())
    .map((row) => {
      const contactedRate = percentOf(row.contacted, row.leads);
      const qualifiedRate = percentOf(row.qualified, row.leads) ?? 0;
      const proposalRate = percentOf(row.proposals, row.leads) ?? 0;
      const wonRate = percentOf(row.wonDeals, row.qualified || row.leads) ?? 0;
      const followUpRate = contactedRate ?? 0;

      return {
        ...row,
        contactedRate,
        qualityScore: Math.min(
          100,
          Math.round(
            qualifiedRate * 0.35 + proposalRate * 0.25 + wonRate * 0.25 + followUpRate * 0.15,
          ),
        ),
      };
    })
    .sort(
      (a, b) =>
        b.qualityScore - a.qualityScore ||
        b.weightedPipelineCents - a.weightedPipelineCents ||
        b.leads - a.leads ||
        a.source.localeCompare(b.source),
    );
}

function ownerLabel(owner: ExecutiveOpportunity["owner"]) {
  if (!owner) return "Unassigned";
  return (
    owner.name ||
    [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() ||
    "Unassigned"
  );
}

function sourceFromAttribution(attribution: unknown) {
  const params = attributionTouchParams(attribution);
  const source = stringParam(params.utm_source);
  const medium = stringParam(params.utm_medium);

  return [source, medium].filter(Boolean).join(" / ") || "Unattributed";
}

function attributionTouchParams(attribution: unknown) {
  const data = jsonObject(attribution);
  const lastTouchParams = jsonObject(jsonObject(data?.lastTouch)?.params);
  const firstTouchParams = jsonObject(jsonObject(data?.firstTouch)?.params);

  return lastTouchParams ?? firstTouchParams ?? {};
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringParam(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function renderClientPackHtml({
  activeRange,
  attributedLeads,
  generatedAt,
  lifecycleRows,
  rangeLabel,
  salesQualityRows,
  sourceRows,
  totalLeads,
  totalSpendCents,
  wonRevenueCents,
}: {
  activeRange: MarketingRange;
  attributedLeads: number;
  generatedAt: Date;
  lifecycleRows: LifecycleFunnelRow[];
  rangeLabel: string;
  salesQualityRows: SalesQualityRow[];
  sourceRows: SourceRow[];
  totalLeads: number;
  totalSpendCents: number;
  wonRevenueCents: number;
}) {
  const qualified = lifecycleRows.find((row) => row.key === "qualified");
  const proposals = lifecycleRows.find((row) => row.key === "proposals");
  const attributionCoverage = percentOf(attributedLeads, totalLeads);
  const roas = totalSpendCents > 0 ? wonRevenueCents / totalSpendCents : null;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>iD30 Executive Report - ${escapeHtml(rangeLabel)}</title>
  <style>
    :root {
      color-scheme: light;
      --border: #d9e2ec;
      --muted: #5f6b7a;
      --soft: #f5f8fb;
      --text: #17202a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef3f8;
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    main {
      width: min(1040px, calc(100% - 32px));
      margin: 32px auto;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 32px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
    }
    h1, h2, p { margin: 0; }
    h1 { font-size: 32px; line-height: 1.1; }
    h2 { font-size: 18px; margin-bottom: 14px; }
    .eyebrow {
      color: #265d97;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .08em;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
      text-align: right;
      white-space: nowrap;
    }
    .summary {
      color: var(--muted);
      margin-top: 12px;
      max-width: 740px;
    }
    .metrics {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-top: 28px;
    }
    .metric, section {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #ffffff;
    }
    .metric { padding: 18px; }
    .metric-label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    .metric-value {
      font-size: 28px;
      font-weight: 800;
      margin-top: 8px;
    }
    .metric-detail {
      color: var(--muted);
      font-size: 13px;
      margin-top: 4px;
    }
    section {
      margin-top: 22px;
      padding: 20px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: var(--soft);
      color: #334155;
      font-size: 12px;
      text-transform: uppercase;
    }
    td { font-size: 13px; }
    tr:last-child td { border-bottom: 0; }
    .number { text-align: right; }
    .muted { color: var(--muted); }
    .footer {
      color: var(--muted);
      font-size: 12px;
      margin-top: 24px;
    }
    @media (max-width: 800px) {
      main { width: 100%; margin: 0; border: 0; border-radius: 0; padding: 20px; }
      header { flex-direction: column; }
      .meta { text-align: left; white-space: normal; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media print {
      body { background: #ffffff; }
      main { width: 100%; margin: 0; border: 0; border-radius: 0; padding: 0; }
      section, .metric { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="eyebrow">iD30 CRM client pack</p>
        <h1>Executive Report</h1>
        <p class="summary">Client-facing commercial attribution summary for ${escapeHtml(rangeLabel)}. This pack focuses on lead coverage, lifecycle movement, qualified pipeline, revenue and best commercial sources.</p>
      </div>
      <div class="meta">
        <p>Generated ${escapeHtml(dateTimeFormatter.format(generatedAt))}</p>
        <p>Range: ${escapeHtml(rangeLabel)}</p>
        <p>Export: ${escapeHtml(activeRange)}</p>
      </div>
    </header>

    <div class="metrics">
      ${renderMetric("Leads", totalLeads.toString(), `${attributedLeads} attributed (${formatPercent(attributionCoverage)})`)}
      ${renderMetric("Qualified pipeline", (qualified?.count ?? 0).toString(), formatMoney(qualified?.valueCents ?? 0))}
      ${renderMetric("Proposals", (proposals?.count ?? 0).toString(), formatMoney(proposals?.valueCents ?? 0))}
      ${renderMetric("Revenue", formatMoney(wonRevenueCents), roas === null ? "ROAS unavailable" : `${formatRatio(roas)} ROAS`)}
    </div>

    <section>
      <h2>Lifecycle Progress</h2>
      <table>
        <thead>
          <tr>
            <th>Stage</th>
            <th class="number">Count</th>
            <th class="number">Value</th>
            <th class="number">Conversion</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          ${lifecycleRows.map(renderLifecycleRow).join("")}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Best Commercial Sources</h2>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th class="number">Leads</th>
            <th class="number">Qualified</th>
            <th class="number">Proposals</th>
            <th class="number">Won</th>
            <th class="number">Won revenue</th>
            <th class="number">Close rate</th>
          </tr>
        </thead>
        <tbody>
          ${
            sourceRows.length
              ? sourceRows.map(renderSourceRow).join("")
              : renderEmptyRow("No source quality rows in this range.", 7)
          }
        </tbody>
      </table>
    </section>

    <section>
      <h2>Sales Quality Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Owner</th>
            <th class="number">Quality</th>
            <th class="number">Contacted</th>
            <th class="number">Qualified</th>
            <th class="number">Weighted pipeline</th>
            <th class="number">Won revenue</th>
          </tr>
        </thead>
        <tbody>
          ${
            salesQualityRows.length
              ? salesQualityRows.map(renderSalesQualityRow).join("")
              : renderEmptyRow("No sales quality rows in this range.", 7)
          }
        </tbody>
      </table>
    </section>

    <p class="footer">This exported client pack excludes internal attribution confidence factors, upload queue diagnostics and provider error details. Open this file in a browser and use print/save-as-PDF when a PDF copy is required.</p>
  </main>
</body>
</html>`;
}

function renderMetric(label: string, value: string, detail: string) {
  return `<div class="metric">
    <p class="metric-label">${escapeHtml(label)}</p>
    <p class="metric-value">${escapeHtml(value)}</p>
    <p class="metric-detail">${escapeHtml(detail)}</p>
  </div>`;
}

function renderLifecycleRow(row: LifecycleFunnelRow) {
  return `<tr>
    <td>${escapeHtml(row.label)}</td>
    <td class="number">${row.count}</td>
    <td class="number">${escapeHtml(row.valueCents === null ? "-" : formatMoney(row.valueCents))}</td>
    <td class="number">${escapeHtml(formatPercent(row.conversionRate))}</td>
    <td class="muted">${escapeHtml(row.detail)}</td>
  </tr>`;
}

function renderSourceRow(row: SourceRow) {
  return `<tr>
    <td>${escapeHtml(row.source)}${row.latest ? `<br><span class="muted">Latest ${escapeHtml(dateFormatter.format(row.latest))}</span>` : ""}</td>
    <td class="number">${row.leads}</td>
    <td class="number">${row.qualified}</td>
    <td class="number">${row.proposals}</td>
    <td class="number">${row.wonDeals}</td>
    <td class="number">${escapeHtml(formatMoney(row.wonCents))}</td>
    <td class="number">${escapeHtml(formatPercent(row.closeRate))}</td>
  </tr>`;
}

function renderSalesQualityRow(row: SalesQualityRow) {
  return `<tr>
    <td>${escapeHtml(row.source)}</td>
    <td>${escapeHtml(row.ownerName)}</td>
    <td class="number">${row.qualityScore}%</td>
    <td class="number">${row.contacted} <span class="muted">(${escapeHtml(formatPercent(row.contactedRate))})</span></td>
    <td class="number">${row.qualified}</td>
    <td class="number">${escapeHtml(formatMoney(row.weightedPipelineCents))}</td>
    <td class="number">${escapeHtml(formatMoney(row.wonCents))}</td>
  </tr>`;
}

function renderEmptyRow(message: string, colSpan: number) {
  return `<tr><td colspan="${colSpan}" class="muted">${escapeHtml(message)}</td></tr>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
