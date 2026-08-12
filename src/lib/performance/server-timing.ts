type TimingOptions = {
  context?: Record<string, string | number | boolean | null | undefined>;
  thresholdMs?: number;
};

const enabled = process.env.PERFORMANCE_LOGGING_ENABLED === "true";

function configuredThresholdMs() {
  const rawThreshold = process.env.PERFORMANCE_LOGGING_THRESHOLD_MS;
  const threshold = rawThreshold ? Number.parseInt(rawThreshold, 10) : NaN;

  return Number.isFinite(threshold) && threshold >= 0 ? threshold : 400;
}

function serializeContext(context: TimingOptions["context"]) {
  if (!context) return "";

  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  );

  return Object.keys(safeContext).length
    ? ` ${JSON.stringify(safeContext)}`
    : "";
}

export async function timeAsync<T>(
  label: string,
  callback: () => Promise<T>,
  options: TimingOptions = {},
) {
  const startedAt = performance.now();

  try {
    return await callback();
  } finally {
    if (enabled) {
      const durationMs = Math.round(performance.now() - startedAt);
      const thresholdMs = options.thresholdMs ?? configuredThresholdMs();

      if (durationMs >= thresholdMs) {
        console.info(
          `[performance] ${label} ${durationMs}ms${serializeContext(
            options.context,
          )}`,
        );
      }
    }
  }
}
