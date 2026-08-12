export function sessionIpLabel(value: string | null) {
  return value?.split(",")[0]?.trim() || "Unknown";
}

export function sessionUserAgentSummary(value: string | null) {
  if (!value) return "Unknown browser";

  const browser =
    value.match(/Edg\/[\d.]+/)?.[0]?.replace("Edg", "Edge") ??
    value.match(/Chrome\/[\d.]+/)?.[0] ??
    value.match(/Firefox\/[\d.]+/)?.[0] ??
    value.match(/Version\/[\d.]+ Safari/)?.[0]?.replace("Version/", "Safari ") ??
    value.match(/Safari\/[\d.]+/)?.[0] ??
    "Browser";
  const platform =
    value.includes("Mac OS X")
      ? "macOS"
      : value.includes("Windows")
        ? "Windows"
        : value.includes("iPhone") || value.includes("iPad")
          ? "iOS"
          : value.includes("Android")
            ? "Android"
            : value.includes("Linux")
              ? "Linux"
              : "Unknown OS";

  return `${browser} on ${platform}`;
}

export function sessionStatusForDate(expiresAt: Date) {
  return expiresAt > new Date() ? "Active" : "Expired";
}
