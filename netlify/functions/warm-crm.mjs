export const config = {
  schedule: "*/4 * * * *",
};

const defaultWarmupPaths = ["/api/health", "/signin"];

export default async function handler() {
  const baseUrl = (
    process.env.APP_BASE_URL ||
    process.env.URL ||
    process.env.DEPLOY_URL ||
    ""
  ).replace(/\/$/, "");

  if (!baseUrl) {
    return Response.json(
      { ok: false, error: "APP_BASE_URL or URL is required for warmup." },
      { status: 500 },
    );
  }

  const paths = (process.env.CRM_WARMUP_PATHS || defaultWarmupPaths.join(","))
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);

  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const url = new URL(path, baseUrl);
      const startedAt = Date.now();
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "text/html,application/json",
          "user-agent": "iD30 CRM Netlify warmup",
        },
        signal: AbortSignal.timeout(10_000),
      });

      await response.arrayBuffer();

      return {
        path,
        status: response.status,
        durationMs: Date.now() - startedAt,
      };
    }),
  );

  const checks = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    return {
      path: paths[index],
      error:
        result.reason instanceof Error
          ? result.reason.message
          : "Warmup failed",
    };
  });
  const ok = checks.every((check) => "status" in check && check.status < 500);

  return Response.json({ ok, checks }, { status: ok ? 200 : 207 });
}
