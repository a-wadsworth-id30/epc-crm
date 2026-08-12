import { PrismaClient } from "@prisma/client";
import { loadDotEnv } from "../env-utils";
import { runDocusignDuplicateDocumentCleanup } from "@/lib/maintenance/docusign-document-dedupe";

loadDotEnv();

const prismaClient = new PrismaClient();

function optionValue(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const result = await runDocusignDuplicateDocumentCleanup({
    applyChanges: process.argv.includes("--apply"),
    entityIdFilter: optionValue("--entity-id"),
    entityTypeFilter: optionValue("--entity-type"),
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
