import { requireAdmin } from "@/lib/auth";
import {
  loadRecordingPage,
  normalizeRecordingFilter,
  normalizeRecordingPage,
  normalizeRecordingPageSize,
} from "@/lib/telephony/recordings";

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const filter = normalizeRecordingFilter(url.searchParams.get("filter"));
  const page = normalizeRecordingPage(url.searchParams.get("page"));
  const pageSize = normalizeRecordingPageSize(url.searchParams.get("pageSize"));
  const cursor = url.searchParams.get("cursor") || null;
  const data = await loadRecordingPage({ cursor, filter, page, pageSize, query });

  return Response.json(data);
}
