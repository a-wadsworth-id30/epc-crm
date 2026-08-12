import { NextRequest } from "next/server";
import { getMcpMarketingReport } from "@/lib/mcp/reports";
import { handleMcpReadToolRequest } from "@/lib/mcp/tool-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleMcpReadToolRequest({
    request,
    requiredScopes: ["crm.marketing.read"],
    toolName: "get_marketing_report",
    successAction: "mcp.marketing_report.read",
    errorAction: "mcp.marketing_report.error",
    run: async ({ args }) => {
      const result = await getMcpMarketingReport(args);

      return {
        data: result,
        audit: {
          view: result.view,
          rows: result.report.rowCount,
        },
      };
    },
  });
}
