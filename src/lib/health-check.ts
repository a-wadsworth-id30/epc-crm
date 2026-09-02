const truthyHealthFlagValues = new Set(["1", "true", "yes", "on"]);

export type HealthCheckEnvironment = Record<string, string | undefined>;

export function healthDatabaseCheckRequested(
  url: string | URL,
  env: HealthCheckEnvironment = process.env,
) {
  const searchParams =
    typeof url === "string"
      ? new URL(url, "http://localhost").searchParams
      : url.searchParams;
  const databaseParam = searchParams.get("database");

  if (databaseParam !== null) {
    return truthyHealthFlagValues.has(databaseParam.trim().toLowerCase());
  }

  return truthyHealthFlagValues.has(
    env.CRM_HEALTH_DATABASE_CHECK?.trim().toLowerCase() ?? "",
  );
}
