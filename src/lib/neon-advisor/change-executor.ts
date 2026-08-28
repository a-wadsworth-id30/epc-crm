import type { AdvisorConfig, ChangeExecutionSummary } from "./types";

export const executableActionAllowList: string[] = [];

export function buildChangeExecutionSummary(
  config: AdvisorConfig,
): ChangeExecutionSummary {
  return {
    allowListedActions: executableActionAllowList,
    enabled: false,
    mode: config.mode,
    reason:
      "Production execution is disabled in the first milestone. The advisor only collects metrics and produces recommendations.",
  };
}

export function assertActionExecutionDisabled(): never {
  throw new Error(
    "Neon advisor execution is disabled. Run in READ_ONLY_ADVISOR mode and request human approval before adding any executable action.",
  );
}
