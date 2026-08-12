import { NextRequest } from "next/server";
import { searchMcpCrm } from "@/lib/mcp/search";
import { handleMcpReadToolRequest } from "@/lib/mcp/tool-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleMcpReadToolRequest({
    request,
    requiredScopes: ["crm.search.read"],
    toolName: "search_crm",
    successAction: "mcp.search.read",
    errorAction: "mcp.search.error",
    run: async ({ args }) => {
      const result = await searchMcpCrm(args);

      return {
        data: result,
        audit: {
          areas: result.areas,
          rows: result.results.length,
        },
      };
    },
  });
}
