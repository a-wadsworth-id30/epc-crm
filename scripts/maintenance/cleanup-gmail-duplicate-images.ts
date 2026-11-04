import { PrismaClient } from "@prisma/client";
import { loadDotEnv } from "../env-utils";
import { runGmailImageDedupe } from "@/lib/maintenance/gmail-image-dedupe";

loadDotEnv();

const prismaClient = new PrismaClient();

function concurrencyOption() {
  const value = process.argv
    .find((argument) => argument.startsWith("--concurrency="))
    ?.split("=")[1];
  const parsed = Number(value ?? 6);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 6;
}

async function main() {
  const result = await runGmailImageDedupe({
    applyChanges: process.argv.includes("--apply"),
    concurrency: concurrencyOption(),
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
