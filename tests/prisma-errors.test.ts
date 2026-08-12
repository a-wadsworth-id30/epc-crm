import { Prisma } from "@prisma/client";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPrismaMissingColumnError,
  isPrismaMissingSchemaError,
  isPrismaMissingTableError,
} from "@/lib/prisma-errors";

function knownError(
  code: string,
  meta: Record<string, unknown>,
  message = "Prisma request failed",
) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    clientVersion: "test",
    code,
    meta,
  });
}

describe("Prisma schema error helpers", () => {
  it("matches missing Prisma model tables by model name", () => {
    const error = knownError("P2021", {
      modelName: "MarketingDailyRollup",
      table: "public.MarketingDailyRollup",
    });

    assert.equal(
      isPrismaMissingTableError(error, { modelName: "MarketingDailyRollup" }),
      true,
    );
    assert.equal(isPrismaMissingSchemaError(error), true);
  });

  it("matches raw SQL missing table errors by table name", () => {
    const error = knownError("P2010", {
      code: "42P01",
      message: 'relation "MarketingDailyRollup" does not exist',
    });

    assert.equal(
      isPrismaMissingTableError(error, { tableName: "MarketingDailyRollup" }),
      true,
    );
  });

  it("matches missing column errors without treating them as missing tables", () => {
    const error = knownError("P2022", {
      column: "transcriptStatus",
      modelName: "CallLog",
    });

    assert.equal(
      isPrismaMissingColumnError(error, {
        columnName: "transcriptStatus",
        modelName: "CallLog",
      }),
      true,
    );
    assert.equal(isPrismaMissingTableError(error), false);
  });

  it("does not match unrelated raw SQL failures", () => {
    const error = knownError("P2010", {
      code: "42883",
      message: 'operator does not exist: "SalesStage" = text',
    });

    assert.equal(isPrismaMissingSchemaError(error), false);
  });

  it("does not match a different optional target", () => {
    const error = knownError("P2021", {
      modelName: "MarketingDailyRollup",
      table: "public.MarketingDailyRollup",
    });

    assert.equal(
      isPrismaMissingTableError(error, { modelName: "AttributionDomain" }),
      false,
    );
  });
});
