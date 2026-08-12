import { NextRequest } from "next/server";
import { getMcpExecutiveReport } from "@/lib/mcp/reports";
import { handleMcpReadToolRequest } from "@/lib/mcp/tool-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleMcpReadToolRequest({
    request,
    requiredScopes: ["crm.reports.read"],
    toolName: "get_executive_report",
    successAction: "mcp.executive_report.read",
    errorAction: "mcp.executive_report.error",
    run: async ({ args }) => {
      const result = await getMcpExecutiveReport(args);

      return {
        data: result,
        audit: { dateRange: result.dateRange },
      };
    },
  });
}
