import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  createNeonOptimizationReport,
  formatNeonOptimizationReport,
  serializableNeonOptimizationReport,
} from "../src/lib/neon-advisor";
import { loadDotEnv } from "./env-utils";

loadDotEnv();

const prisma = process.env.DATABASE_URL?.trim() ? new PrismaClient() : null;

main();

async function main() {
  try {
    const report = await createNeonOptimizationReport({
      cwd: process.cwd(),
      prisma,
    });

    console.log(formatNeonOptimizationReport(report));

    if (report.config.outputPath) {
      const outputPath = path.isAbsolute(report.config.outputPath)
        ? report.config.outputPath
        : path.join(process.cwd(), report.config.outputPath);

      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(
        outputPath,
        `${JSON.stringify(serializableNeonOptimizationReport(report), null, 2)}\n`,
        "utf8",
      );
      console.log("");
      console.log(`JSON audit report written to ${path.relative(process.cwd(), outputPath)}`);
    }
  } catch (error) {
    console.error("Neon optimization advisor failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}
