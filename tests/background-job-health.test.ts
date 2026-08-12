import { BackgroundJobRunStatus } from "@prisma/client";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  backgroundJobStaleCutoff,
  backgroundJobStaleMinutes,
  formatBackgroundJobName,
  isBackgroundJobRunStale,
} from "@/lib/maintenance/background-job-health";

const originalStaleMinutes = process.env.BACKGROUND_JOB_STALE_MINUTES;

describe("background job health helpers", () => {
  afterEach(() => {
    if (originalStaleMinutes === undefined) {
      delete process.env.BACKGROUND_JOB_STALE_MINUTES;
    } else {
      process.env.BACKGROUND_JOB_STALE_MINUTES = originalStaleMinutes;
    }
  });

  it("defaults and clamps stale thresholds", () => {
    delete process.env.BACKGROUND_JOB_STALE_MINUTES;

    assert.equal(backgroundJobStaleMinutes(), 30);
    assert.equal(backgroundJobStaleMinutes("1"), 5);
    assert.equal(backgroundJobStaleMinutes("999999"), 1440);
    assert.equal(backgroundJobStaleMinutes("45"), 45);
    assert.equal(backgroundJobStaleMinutes("not-a-number"), 30);
  });

  it("calculates stale running jobs only", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    const cutoff = backgroundJobStaleCutoff(now, 30);

    assert.equal(
      isBackgroundJobRunStale(
        {
          startedAt: new Date("2026-07-21T11:20:00.000Z"),
          status: BackgroundJobRunStatus.RUNNING,
        },
        cutoff,
      ),
      true,
    );
    assert.equal(
      isBackgroundJobRunStale(
        {
          startedAt: new Date("2026-07-21T11:20:00.000Z"),
          status: BackgroundJobRunStatus.ERROR,
        },
        cutoff,
      ),
      false,
    );
    assert.equal(
      isBackgroundJobRunStale(
        {
          startedAt: cutoff,
          status: BackgroundJobRunStatus.RUNNING,
        },
        cutoff,
      ),
      false,
    );
  });

  it("formats stored job names for admin-facing text", () => {
    assert.equal(
      formatBackgroundJobName("marketing-conversion-upload-process"),
      "Marketing Conversion Upload Process",
    );
  });
});
