export function formatDateTime(
  value: Date | string | null | undefined,
  fallback = "Unknown",
) {
  if (!value || value === "unknown") return fallback;

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : fallback;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatRelativeDate(
  value: Date | string | null | undefined,
  fallback = "Unknown",
) {
  if (!value || value === "unknown") return fallback;

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return fallback;

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}
