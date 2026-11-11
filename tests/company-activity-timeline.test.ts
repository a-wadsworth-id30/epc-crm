import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CompanyActivityTimeline from "../src/components/crm-boilerplate/CompanyActivityTimeline";

test("renders linked Company activity with clear source and status context", () => {
  const html = renderToStaticMarkup(
    createElement(CompanyActivityTimeline, {
      items: [
        {
          actor: "Jamie Example",
          date: "2026-11-11T10:30:00.000Z",
          detail: "Whole-home upgrade",
          href: "/sales/sale-1",
          id: "communication-1",
          kind: "Communication",
          status: "Received | EMAIL",
          summary: "Please confirm the survey date.",
          title: "Survey date",
        },
      ],
    }),
  );

  assert.match(html, /Company activity/);
  assert.match(html, /Received \| EMAIL/);
  assert.match(html, /Jamie Example/);
  assert.match(html, /href="\/sales\/sale-1"/);
});

test("Company activity reuses permission-scoped records without duplicate CallLog rows", () => {
  const page = readFileSync("src/app/(admin)/clients/[id]/page.tsx", "utf8");
  const workspace = readFileSync(
    "src/components/crm-boilerplate/CompanyDetailWorkspace.tsx",
    "utf8",
  );

  assert.match(page, /prisma\.salesCommunication\.findMany/);
  assert.match(page, /prisma\.note\.findMany/);
  assert.match(page, /prisma\.task\.findMany/);
  assert.match(page, /salesOpportunityWhereWithAccess/);
  assert.match(page, /contactAccessWhere/);
  assert.doesNotMatch(page, /prisma\.callLog\.findMany/);
  assert.match(workspace, /key: "activity"/);
  assert.match(workspace, /activeTab === "activity"/);
});
