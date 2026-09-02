import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { healthDatabaseCheckRequested } from "../src/lib/health-check";

describe("health check database opt-in", () => {
  it("skips database checks by default", () => {
    assert.equal(healthDatabaseCheckRequested("/api/health", {}), false);
  });

  it("allows explicit database checks from the query string", () => {
    assert.equal(
      healthDatabaseCheckRequested("/api/health?database=1", {}),
      true,
    );
    assert.equal(
      healthDatabaseCheckRequested("/api/health?database=true", {}),
      true,
    );
  });

  it("lets the query string disable an environment default", () => {
    assert.equal(
      healthDatabaseCheckRequested("/api/health?database=0", {
        CRM_HEALTH_DATABASE_CHECK: "true",
      }),
      false,
    );
  });

  it("supports a temporary environment fallback for DB-backed health checks", () => {
    assert.equal(
      healthDatabaseCheckRequested("/api/health", {
        CRM_HEALTH_DATABASE_CHECK: "yes",
      }),
      true,
    );
  });
});
