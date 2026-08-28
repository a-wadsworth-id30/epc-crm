import { PrismaClient } from "@prisma/client";
import {
  databaseQueryLabel,
  databaseQueryTimingEnabled,
  recordDatabaseQueryTiming,
} from "@/lib/performance/db-query-metrics";
import { databaseUrlWithPoolDefaults } from "@/lib/database/connection-url";

function createPrismaClient(): PrismaClient {
  const datasourceUrl = databaseUrlWithPoolDefaults(process.env.DATABASE_URL);
  const client = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

  if (!databaseQueryTimingEnabled()) {
    return client;
  }

  const instrumentedClient = client.$extends({
    name: "database-query-performance",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const startedAt = performance.now();

          try {
            return await query(args);
          } finally {
            recordDatabaseQueryTiming({
              durationMs: performance.now() - startedAt,
              label: databaseQueryLabel(model, operation),
            });
          }
        },
      },
    },
  });

  return instrumentedClient as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
