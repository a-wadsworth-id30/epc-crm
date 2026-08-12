import { NextRequest } from "next/server";
import { getMcpSalesSummary } from "@/lib/mcp/sales-summary";
import { handleMcpReadToolRequest } from "@/lib/mcp/tool-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleMcpReadToolRequest({
    request,
    requiredScopes: ["crm.sales.read"],
    toolName: "get_sales_summary",
    successAction: "mcp.sales_summary.read",
    errorAction: "mcp.sales_summary.error",
    run: async ({ args }) => {
      const result = await getMcpSalesSummary(args);

      return {
        data: result,
        audit: {
          dateRange: result.dateRange,
          rows: {
            byOwner: result.byOwner.length,
            byStage: result.byStage.length,
            recent: result.recent.length,
          },
        },
      };
    },
  });
}
