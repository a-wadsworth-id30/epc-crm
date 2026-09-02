const defaultCrmSettingsCacheSeconds = 3600;
const minimumCrmSettingsCacheSeconds = 300;

export function crmSettingsCacheRevalidateSeconds(
  env: Record<string, string | undefined> = process.env,
) {
  const rawValue = env.CRM_SETTINGS_CACHE_REVALIDATE_SECONDS?.trim() ?? "";

  if (!rawValue) {
    return defaultCrmSettingsCacheSeconds;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    return defaultCrmSettingsCacheSeconds;
  }

  return Math.max(minimumCrmSettingsCacheSeconds, Math.floor(value));
}
