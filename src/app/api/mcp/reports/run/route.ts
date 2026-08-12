import { NextRequest } from "next/server";
import { runMcpReport } from "@/lib/mcp/reports";
import { handleMcpReadToolRequest } from "@/lib/mcp/tool-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleMcpReadToolRequest({
    request,
    requiredScopes: ["crm.reports.read"],
    toolName: "run_report",
    successAction: "mcp.report.run",
    errorAction: "mcp.report.error",
    run: async ({ args }) => {
      const result = await runMcpReport(args);

      return {
        data: result,
        audit: {
          dataset: result.report.plan.dataset,
          rows: result.report.rowCount,
          title: result.report.title,
        },
      };
    },
  });
}
