import { PrismaClient } from "@prisma/client";
import { loadDotEnv } from "../env-utils";
import { runGmailR2LegacyCleanup } from "@/lib/maintenance/gmail-r2-legacy-cleanup";

loadDotEnv();

const prismaClient = new PrismaClient();

function limitOption() {
  const value = process.argv
    .find((argument) => argument.startsWith("--limit="))
    ?.split("=")[1];
  const parsed = Number(value ?? 100);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 100;
}

async function main() {
  const result = await runGmailR2LegacyCleanup({
    applyChanges: process.argv.includes("--apply"),
    limit: limitOption(),
    prismaClient,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaClient.$disconnect();
  });
