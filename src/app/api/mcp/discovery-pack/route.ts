import { NextRequest } from "next/server";
import { getMcpDiscoveryPack } from "@/lib/mcp/discovery-pack";
import { handleMcpReadToolRequest } from "@/lib/mcp/tool-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleMcpReadToolRequest({
    request,
    requiredScopes: ["crm.reports.read", "crm.sales.read"],
    toolName: "get_discovery_pack",
    successAction: "mcp.discovery-pack.read",
    errorAction: "mcp.discovery-pack.error",
    run: async ({ args }) => {
      const result = await getMcpDiscoveryPack(args);
      const lead = "lead" in result ? result.lead : null;
      const discovery = "discovery" in result ? result.discovery : null;
      const documents = "documents" in result ? result.documents : null;
      const stageGate = "stageGate" in result ? result.stageGate : null;

      return {
        data: result,
        audit: {
          found: result.found,
          leadId: lead?.id ?? null,
          matchedBy: result.lookup.matchedBy,
          answerCount: discovery?.answerCount ?? 0,
          documentCount: documents?.totalCount ?? 0,
          stageGateMissingCount: stageGate?.missingCount ?? 0,
        },
      };
    },
  });
}
