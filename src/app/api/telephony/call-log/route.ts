import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  loadCallLogPage,
  normalizeCallDirectionFilter,
  normalizeCallLogPage,
  normalizeCallLogPageSize,
  normalizeCallStatusFilter,
} from "@/lib/telephony/call-log";

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const direction = normalizeCallDirectionFilter(url.searchParams.get("direction") ?? undefined);
  const status = normalizeCallStatusFilter(url.searchParams.get("status") ?? undefined);
  const page = normalizeCallLogPage(url.searchParams.get("page") ?? undefined);
  const pageSize = normalizeCallLogPageSize(url.searchParams.get("pageSize") ?? undefined);
  const selectedCallId = url.searchParams.get("call") || null;
  const cursor = url.searchParams.get("cursor") || null;

  const result = await loadCallLogPage({
    cursor,
    direction,
    page,
    pageSize,
    query,
    selectedCallId,
    status,
  });

  return NextResponse.json(result);
}
