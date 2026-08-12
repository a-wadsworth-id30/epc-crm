import { BackgroundJobRunStatus } from "@prisma/client";

const minuteMs = 60 * 1000;
const defaultBackgroundJobStaleMinutes = 30;
const minBackgroundJobStaleMinutes = 5;
const maxBackgroundJobStaleMinutes = 24 * 60;

export function backgroundJobStaleMinutes(
  value = process.env.BACKGROUND_JOB_STALE_MINUTES,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultBackgroundJobStaleMinutes;
  }

  return Math.min(
    Math.max(Math.floor(parsed), minBackgroundJobStaleMinutes),
    maxBackgroundJobStaleMinutes,
  );
}

export function backgroundJobStaleCutoff(
  now = new Date(),
  minutes = backgroundJobStaleMinutes(),
) {
  return new Date(now.getTime() - minutes * minuteMs);
}

export function isBackgroundJobRunStale(
  run: { startedAt: Date; status: BackgroundJobRunStatus },
  staleCutoff: Date,
) {
  return (
    run.status === BackgroundJobRunStatus.RUNNING &&
    run.startedAt.getTime() < staleCutoff.getTime()
  );
}

export function formatBackgroundJobName(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
