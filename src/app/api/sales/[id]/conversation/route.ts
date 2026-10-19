import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { listSaleConversationPage } from "@/lib/sales/conversation-history";
import {
  isSaleConversationFilter,
  saleConversationPageSize,
} from "@/lib/sales/conversation-types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const url = new URL(request.url);
  const requestedFilter = url.searchParams.get("filter")?.toUpperCase() ?? "ALL";
  const filter = isSaleConversationFilter(requestedFilter)
    ? requestedFilter
    : "ALL";
  const requestedPage = Number(url.searchParams.get("page") ?? "1");
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const query = url.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  const result = await listSaleConversationPage({
    filter,
    page,
    query,
    saleId: id,
    user: auth.user,
  });

  if (!result) {
    return NextResponse.json(
      { message: "Sale conversation not found." },
      { status: 404 },
    );
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Conversation-Page-Size": String(saleConversationPageSize),
    },
  });
}
