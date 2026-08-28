import type { RollbackSummary } from "./types";

export function buildRollbackSummary(): RollbackSummary {
  return {
    ready: false,
    requirements: [
      "Capture pre-change metrics before any approved action.",
      "Define the exact previous configuration or commit to restore.",
      "Define health, latency, error-rate, connection and database-saturation thresholds.",
      "Confirm the rollback command can run before the change is executed.",
      "Keep destructive actions unsupported.",
    ],
  };
}
