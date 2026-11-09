import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BackgroundJobRunStatus } from "@prisma/client";
import {
  gmailWatchOperationStatus,
  parseGmailWatchOperationSummary,
} from "../src/lib/integrations/gmail-watch-operations";

describe("Gmail watch operation summaries", () => {
  it("classifies successful, partial and failed renewal batches", () => {
    assert.equal(
      gmailWatchOperationStatus({
        deferred: 0,
        failed: 0,
        processed: 2,
        renewed: 2,
      }),
      BackgroundJobRunStatus.SUCCESS,
    );
    assert.equal(
      gmailWatchOperationStatus({
        deferred: 1,
        failed: 1,
        processed: 2,
        renewed: 1,
      }),
      BackgroundJobRunStatus.WARNING,
    );
    assert.equal(
      gmailWatchOperationStatus({
        deferred: 0,
        failed: 2,
        processed: 2,
        renewed: 0,
      }),
      BackgroundJobRunStatus.ERROR,
    );
  });

  it("parses only complete non-negative count summaries", () => {
    assert.deepEqual(
      parseGmailWatchOperationSummary({
        deferred: 1,
        failed: 0,
        processed: 2,
        renewed: 2,
      }),
      { deferred: 1, failed: 0, processed: 2, renewed: 2 },
    );
    assert.equal(parseGmailWatchOperationSummary({ processed: 2 }), null);
    assert.equal(
      parseGmailWatchOperationSummary({
        deferred: 0,
        failed: -1,
        processed: 1,
        renewed: 0,
      }),
      null,
    );
  });
});
