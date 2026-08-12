import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  databaseQueryPerformanceSnapshot,
  resetDatabaseQueryPerformance,
} from "@/lib/performance/db-query-metrics";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function GET() {
  await requireAdmin();

  return NextResponse.json(databaseQueryPerformanceSnapshot(), {
    headers: noStoreHeaders,
  });
}

export async function DELETE() {
  await requireAdmin();

  return NextResponse.json(resetDatabaseQueryPerformance(), {
    headers: noStoreHeaders,
  });
}
