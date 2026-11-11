import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConnectedRecordContext from "../src/components/crm-boilerplate/ConnectedRecordContext";

test("renders linked company, person and sale context with one current record", () => {
  const html = renderToStaticMarkup(
    createElement(ConnectedRecordContext, {
      company: {
        href: "/clients/company-1",
        label: "Company",
        meta: "Active",
        name: "Example Energy",
      },
      currentRecord: "person",
      nextAction: "Book the survey",
      person: {
        label: "Person",
        meta: "Consumer",
        name: "Jamie Example",
      },
      sale: {
        href: "/sales/sale-1",
        label: "Active sale",
        meta: "Qualified",
        name: "Heat pump enquiry",
      },
    }),
  );

  assert.match(html, /Connected customer context/);
  assert.match(html, /href="\/clients\/company-1"/);
  assert.match(html, /href="\/sales\/sale-1"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /Book the survey/);
});

test("shows safe empty states for records and next action that are not linked", () => {
  const html = renderToStaticMarkup(
    createElement(ConnectedRecordContext, {
      currentRecord: "company",
    }),
  );

  assert.match(html, /No record linked/);
  assert.match(html, /Next action:/);
  assert.match(html, /Not captured/);
});
