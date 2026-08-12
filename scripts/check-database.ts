import { PrismaClient } from "@prisma/client";
import { loadDotEnv } from "./env-utils";

loadDotEnv();

const prisma = new PrismaClient();

main();

async function main() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const [migrationTable, userCount, contactCount, saleCount, fileCount] =
      await Promise.all([
        prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists
        `,
        prisma.user.count(),
        prisma.contact.count(),
        prisma.salesOpportunity.count(),
        prisma.fileAsset.count(),
      ]);

    const migrationCount = migrationTable[0]?.exists
      ? await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations"
        `
      : null;

    console.log("Database check passed.");
    console.log(
      `Applied migrations: ${
        migrationCount
          ? (migrationCount[0]?.count.toString() ?? "0")
          : "not tracked in this database"
      }`,
    );
    console.log(`Users: ${userCount}`);
    console.log(`Contacts: ${contactCount}`);
    console.log(`Sales: ${saleCount}`);
    console.log(`Files: ${fileCount}`);
  } catch (error) {
    console.error("Database check failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
