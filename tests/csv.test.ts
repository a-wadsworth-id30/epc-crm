import assert from "node:assert/strict";
import test from "node:test";
import { csvCell, toCsv } from "../src/lib/csv";

test("CSV cells escape quotes and spreadsheet formulas", () => {
  assert.equal(csvCell('A "quoted" value'), '"A ""quoted"" value"');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell("@SUM(A1:A2)"), '"\'@SUM(A1:A2)"');
});

test("CSV output includes an Excel-compatible UTF-8 marker", () => {
  assert.equal(toCsv([["Name", "Type"], ["Adam", "Installer"]]), '\uFEFF"Name","Type"\n"Adam","Installer"');
});
