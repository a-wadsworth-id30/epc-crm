import { PrismaClient } from "@prisma/client";
import {
  databaseQueryLabel,
  databaseQueryTimingEnabled,
  recordDatabaseQueryTiming,
} from "@/lib/performance/db-query-metrics";

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

function databaseUrlWithPoolDefaults(url: string | undefined) {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const isNeonPooler = parsed.hostname.includes("-pooler.");

    if (!isNeonPooler) return url;

    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set(
        "connection_limit",
        process.env.PRISMA_CONNECTION_LIMIT ?? "1",
      );
    }

    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set(
        "pool_timeout",
        process.env.PRISMA_POOL_TIMEOUT ?? "10",
      );
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
