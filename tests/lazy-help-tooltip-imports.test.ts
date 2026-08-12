import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const sourceRoot = path.join(process.cwd(), "src");
const allowedImporter = path.join(
  sourceRoot,
  "components",
  "crm-boilerplate",
  "LazyHelpTooltip.tsx",
);
const sourceExtensions = new Set([".ts", ".tsx"]);
const directHelpTooltipImport =
  /from\s+["']@\/components\/crm-boilerplate\/HelpTooltip["']/;

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return sourceExtensions.has(path.extname(entry)) ? [fullPath] : [];
  });
}

describe("lazy help tooltip imports", () => {
  it("keeps route components from importing the tooltip library directly", () => {
    const directImporters = collectSourceFiles(sourceRoot).filter((filePath) => {
      if (filePath === allowedImporter) return false;

      return directHelpTooltipImport.test(readFileSync(filePath, "utf8"));
    });

    assert.deepEqual(
      directImporters.map((filePath) => path.relative(process.cwd(), filePath)),
      [],
      "Use LazyHelpTooltip so tooltip positioning code stays out of first-load route chunks.",
    );
  });
});
