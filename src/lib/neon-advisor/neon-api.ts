import type { AdvisorConfig, AdvisorCapability, NeonApiSnapshot } from "./types";
import {
  availableCapability,
  skippedCapability,
  scrubSensitiveValue,
  unavailableCapability,
} from "./safety";

type FetchImpl = typeof fetch;

const neonSource = "neon-api";

export async function collectNeonApiSnapshot({
  apiKey,
  config,
  fetchImpl = fetch,
}: {
  apiKey: string | null;
  config: AdvisorConfig;
  fetchImpl?: FetchImpl;
}): Promise<NeonApiSnapshot> {
  if (!apiKey || !config.neon.projectId) {
    return skippedNeonSnapshot(
      "Set NEON_API_KEY and NEON_PROJECT_ID to collect Neon project telemetry.",
    );
  }

  const projectId = encodeURIComponent(config.neon.projectId);
  const [project, branches, endpoints, operations, projectConsumption] =
    await Promise.all([
      safeNeonGet({
        apiKey,
        config,
        fetchImpl,
        name: "project",
        path: `/projects/${projectId}`,
      }),
      safeNeonGet({
        apiKey,
        config,
        fetchImpl,
        name: "branches",
        path: `/projects/${projectId}/branches`,
      }),
      safeNeonGet({
        apiKey,
        config,
        fetchImpl,
        name: "endpoints",
        path: `/projects/${projectId}/endpoints`,
      }),
      safeNeonGet({
        apiKey,
        config,
        fetchImpl,
        name: "operations",
        path: `/projects/${projectId}/operations`,
        searchParams: { limit: "50" },
      }),
      collectProjectConsumption({ apiKey, config, fetchImpl, projectId }),
    ]);

  const branchConsumption = config.neon.orgId
    ? await safeNeonGet({
        config,
        fetchImpl,
        apiKey,
        name: "branch-consumption-history",
        path: "/consumption_history/branches",
        searchParams: {
          from: daysAgoIso(30),
          granularity: "daily",
          limit: "100",
          org_id: config.neon.orgId,
          project_ids: config.neon.projectId,
          to: new Date().toISOString(),
        },
      })
    : skippedCapability<unknown>({
        name: "branch-consumption-history",
        reason: "Set NEON_ORG_ID to collect branch-level consumption history.",
        source: neonSource,
      });

  return {
    branchConsumption,
    branches,
    endpoints,
    operations,
    project,
    projectConsumption,
  };
}

async function collectProjectConsumption({
  apiKey,
  config,
  fetchImpl,
  projectId,
}: {
  apiKey: string;
  config: AdvisorConfig;
  fetchImpl: FetchImpl;
  projectId: string;
}) {
  if (config.neon.orgId) {
    const consumption = await safeNeonGet({
      config,
      fetchImpl,
      apiKey,
      name: "project-consumption-history",
      path: "/consumption_history/projects",
      searchParams: {
        from: daysAgoIso(30),
        granularity: "daily",
        limit: "100",
        metrics: [
          "compute_time_seconds",
          "compute_unit_seconds",
          "data_transfer_bytes",
          "logical_size_bytes",
          "synthetic_storage_size_bytes",
          "written_data_bytes",
        ].join(","),
        org_id: config.neon.orgId,
        project_ids: projectId,
        to: new Date().toISOString(),
      },
    });

    if (consumption.status === "available") return consumption;
  }

  return safeNeonGet({
    config,
    fetchImpl,
    apiKey,
    name: "project-consumption-history",
    path: `/projects/${projectId}/consumption_history`,
    searchParams: {
      from: daysAgoIso(30),
      granularity: "daily",
      to: new Date().toISOString(),
    },
  });
}

async function safeNeonGet({
  apiKey,
  config,
  fetchImpl,
  name,
  path,
  searchParams = {},
}: {
  apiKey: string;
  config: AdvisorConfig;
  fetchImpl: FetchImpl;
  name: string;
  path: string;
  searchParams?: Record<string, string>;
}): Promise<AdvisorCapability<unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.neon.requestTimeoutMs,
  );

  try {
    const url = new URL(`${config.neon.apiUrl.replace(/\/$/, "")}${path}`);

    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }

    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return unavailableCapability({
        error: new Error(`Neon API returned ${response.status}`),
        name,
        source: neonSource,
      });
    }

    return availableCapability({
      data: scrubSensitiveValue(await response.json()),
      name,
      source: neonSource,
    });
  } catch (error) {
    return unavailableCapability({ error, name, source: neonSource });
  } finally {
    clearTimeout(timeout);
  }
}

function skippedNeonSnapshot(reason: string): NeonApiSnapshot {
  return {
    branchConsumption: skippedCapability({
      name: "branch-consumption-history",
      reason,
      source: neonSource,
    }),
    branches: skippedCapability({ name: "branches", reason, source: neonSource }),
    endpoints: skippedCapability({ name: "endpoints", reason, source: neonSource }),
    operations: skippedCapability({ name: "operations", reason, source: neonSource }),
    project: skippedCapability({ name: "project", reason, source: neonSource }),
    projectConsumption: skippedCapability({
      name: "project-consumption-history",
      reason,
      source: neonSource,
    }),
  };
}

function daysAgoIso(days: number) {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString();
}
