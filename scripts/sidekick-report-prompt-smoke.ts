import Module from "node:module";
import { selectSidekickTools } from "../src/lib/ai/sidekick-intent";

type ExpectedPlan = {
  dataset: string;
  dimensions?: string[];
  filters?: Array<{ field: string; operator: string; value: string }>;
  metrics?: string[];
};

type PromptCase = {
  prompt: string;
  expectedTool?: string;
  plan?: ExpectedPlan;
};

const loader = Module as unknown as {
  _load: (request: string, ...args: unknown[]) => unknown;
};
const originalLoad = loader._load;

loader._load = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...args);
};

const cases: PromptCase[] = [
  {
    prompt: "How many leads did we get this month compared with last month?",
    plan: { dataset: "sales_opportunities", dimensions: ["month"] },
  },
  {
    prompt: "What is our best day for getting leads?",
    plan: { dataset: "sales_opportunities", dimensions: ["weekday"] },
  },
  {
    prompt: "Which lead owner has the most open leads?",
    plan: {
      dataset: "sales_opportunities",
      dimensions: ["owner"],
      filters: [{ field: "isOpen", operator: "equals", value: "Open" }],
    },
  },
  {
    prompt: "What products do I get asked for most on leads?",
    plan: { dataset: "opportunity_products", dimensions: ["product"] },
  },
  {
    prompt: "Which Google Ads campaign generated the most leads?",
    plan: {
      dataset: "marketing_attribution",
      dimensions: ["campaign"],
      filters: [{ field: "platform", operator: "equals", value: "Google Ads" }],
    },
  },
  {
    prompt: "Which Search Console queries generate enquiries?",
    plan: {
      dataset: "marketing_attribution",
      dimensions: ["term"],
      filters: [
        {
          field: "platform",
          operator: "equals",
          value: "Google Search Console",
        },
      ],
    },
  },
  {
    prompt: "Which submitted form fields are most common?",
    plan: { dataset: "form_submissions", dimensions: ["field"] },
  },
  {
    prompt: "Which contacts have open opportunities?",
    plan: {
      dataset: "contacts_clients",
      dimensions: ["contact"],
      filters: [
        {
          field: "openOpportunityStatus",
          operator: "equals",
          value: "Has open opportunity",
        },
      ],
    },
  },
  {
    prompt: "Which admins do not have 2FA enabled?",
    plan: {
      dataset: "users_security",
      dimensions: ["user"],
      metrics: ["twoFactorMissing"],
    },
  },
  {
    prompt: "Which files are not linked to a record?",
    plan: {
      dataset: "storage_assets",
      filters: [{ field: "linkStatus", operator: "equals", value: "Unlinked" }],
      metrics: ["unlinkedFiles"],
    },
  },
  {
    prompt: "Which tasks are overdue by assignee?",
    plan: {
      dataset: "tasks",
      dimensions: ["assignee"],
      filters: [{ field: "dueStatus", operator: "equals", value: "Overdue" }],
      metrics: ["overdueTasks"],
    },
  },
  {
    prompt: "Which users sent the most emails?",
    plan: {
      dataset: "communications",
      dimensions: ["owner"],
      filters: [
        { field: "channel", operator: "equals", value: "Email" },
        { field: "direction", operator: "equals", value: "Outbound" },
      ],
      metrics: ["emailCount"],
    },
  },
  {
    prompt: "What platforms do leads ask for in Discovery?",
    plan: {
      dataset: "discovery_answers",
      dimensions: ["answer"],
      filters: [{ field: "question", operator: "contains", value: "platform" }],
    },
  },
  {
    prompt: "What is our contacted rate by owner?",
    plan: {
      dataset: "sales_lifecycle",
      dimensions: ["owner"],
      metrics: ["contactedRate"],
    },
  },
  {
    prompt: "Which recordings are missing transcripts?",
    plan: {
      dataset: "calls",
      dimensions: ["transcriptStatus"],
      metrics: ["transcriptMissing"],
    },
  },
  {
    prompt: "What setup items are outstanding?",
    plan: {
      dataset: "setup_readiness",
      dimensions: ["item"],
      filters: [{ field: "status", operator: "not_equals", value: "Ready" }],
    },
  },
];

function startsWithAll(actual: string[], expected: string[] | undefined) {
  if (!expected?.length) return true;
  return expected.every((value, index) => actual[index] === value);
}

function includesFilters(
  actual: Array<{ field: string; operator: string; value: string | string[] }>,
  expected: ExpectedPlan["filters"],
) {
  if (!expected?.length) return true;

  return expected.every((filter) =>
    actual.some(
      (candidate) =>
        candidate.field === filter.field &&
        candidate.operator === filter.operator &&
        candidate.value === filter.value,
    ),
  );
}

function fail(message: string) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  const { reportPlanFromPrompt } = await import("../src/lib/reports/engine");
  let passed = 0;

  for (const testCase of cases) {
    const expectedTool = testCase.expectedTool ?? "crm_run_report";
    const tool = selectSidekickTools(testCase.prompt)[0];

    if (tool !== expectedTool) {
      fail(`FAIL tool: "${testCase.prompt}" expected ${expectedTool}, got ${tool}`);
      continue;
    }

    if (!testCase.plan) {
      passed += 1;
      console.log(`PASS ${testCase.prompt}`);
      continue;
    }

    const plan = reportPlanFromPrompt(testCase.prompt);
    const expected = testCase.plan;
    const ok =
      plan.dataset === expected.dataset &&
      startsWithAll(plan.dimensions, expected.dimensions) &&
      startsWithAll(plan.metrics, expected.metrics) &&
      includesFilters(plan.filters, expected.filters);

    if (!ok) {
      fail(
        `FAIL plan: "${testCase.prompt}"\nExpected: ${JSON.stringify(
          expected,
        )}\nActual: ${JSON.stringify({
          dataset: plan.dataset,
          dimensions: plan.dimensions,
          filters: plan.filters,
          metrics: plan.metrics,
        })}`,
      );
      continue;
    }

    passed += 1;
    console.log(`PASS ${testCase.prompt}`);
  }

  if (process.exitCode) {
    console.error(`${passed}/${cases.length} Sidekick prompt smoke checks passed.`);
    return;
  }

  console.log(`${passed}/${cases.length} Sidekick prompt smoke checks passed.`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
