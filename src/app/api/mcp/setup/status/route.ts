import { NextRequest } from "next/server";
import { getMcpSetupStatus } from "@/lib/mcp/reports";
import { handleMcpReadToolRequest } from "@/lib/mcp/tool-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleMcpReadToolRequest({
    request,
    requiredScopes: ["crm.setup.read"],
    toolName: "get_setup_status",
    successAction: "mcp.setup_status.read",
    errorAction: "mcp.setup_status.error",
    run: async () => {
      const result = await getMcpSetupStatus();

      return {
        data: result,
        audit: {
          actionableCount: result.summary.actionableCount,
          completionPercent: result.summary.completionPercent,
          readyCount: result.summary.readyCount,
          warningCount: result.summary.warningCount,
        },
      };
    },
  });
}
