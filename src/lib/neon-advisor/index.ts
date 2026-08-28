import { buildChangeExecutionSummary } from "./change-executor";
import { readAdvisorConfig } from "./config";
import { buildCostModelContext } from "./cost-model";
import { collectNeonApiSnapshot } from "./neon-api";
import { analyzePostgres } from "./postgres-analyzer";
import { buildRecommendations } from "./recommendation-engine";
import { inspectRepository } from "./repository-inspector";
import { buildRollbackSummary } from "./rollback-manager";
import {
  formatNeonOptimizationReport,
  serializableNeonOptimizationReport,
} from "./report";
import { buildValidationSummary } from "./validation-engine";
import type { AdvisorRuntime, NeonOptimizationReport } from "./types";

export {
  formatNeonOptimizationReport,
  readAdvisorConfig,
  serializableNeonOptimizationReport,
};

export async function createNeonOptimizationReport({
  cwd,
  env = process.env,
  fetchImpl,
  prisma,
}: AdvisorRuntime): Promise<NeonOptimizationReport> {
  const config = readAdvisorConfig(env);
  const repository = inspectRepository({ cwd, env });
  const [postgres, neon] = await Promise.all([
    analyzePostgres(prisma),
    collectNeonApiSnapshot({
      apiKey: env.NEON_API_KEY?.trim() || null,
      config,
      fetchImpl,
    }),
  ]);
  const costModel = buildCostModelContext({ config, neon, postgres });
  const validation = buildValidationSummary(config.thresholds);
  const recommendations = buildRecommendations({
    config,
    costModel,
    neon,
    postgres,
    repository,
  });

  return {
    changeExecution: buildChangeExecutionSummary(config),
    config,
    costModel,
    generatedAt: new Date().toISOString(),
    mode: config.mode,
    neon,
    postgres,
    recommendations,
    repository,
    rollback: buildRollbackSummary(),
    validation,
  };
}
