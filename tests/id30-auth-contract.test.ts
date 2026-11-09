import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  id30AuthContractCompatibility,
  requiredGmailPushCapabilities,
} from "../src/lib/integrations/id30-auth-contract";

describe("iD30 Auth CRM contract compatibility", () => {
  it("accepts the supported version with every required capability", () => {
    const result = id30AuthContractCompatibility(
      {
        capabilities: [...requiredGmailPushCapabilities, "gmail.sync.v1"],
        minimumCompatibleVersion: 1,
        name: "id30-auth-crm",
        version: 1,
      },
      requiredGmailPushCapabilities,
    );

    assert.equal(result.compatible, true);
  });

  it("fails closed when the descriptor is missing", () => {
    const result = id30AuthContractCompatibility(
      null,
      requiredGmailPushCapabilities,
    );

    assert.equal(result.compatible, false);
    assert.match(result.message, /did not report/i);
  });

  it("rejects a newer minimum compatible version", () => {
    const result = id30AuthContractCompatibility({
      capabilities: [...requiredGmailPushCapabilities],
      minimumCompatibleVersion: 2,
      name: "id30-auth-crm",
      version: 2,
    });

    assert.equal(result.compatible, false);
    assert.match(result.message, /requires v2/i);
  });

  it("reports missing capabilities", () => {
    const result = id30AuthContractCompatibility(
      {
        capabilities: ["signed-requests.v1"],
        minimumCompatibleVersion: 1,
        name: "id30-auth-crm",
        version: 1,
      },
      requiredGmailPushCapabilities,
    );

    assert.equal(result.compatible, false);
    assert.ok(result.missingCapabilities.includes("gmail.push.v1"));
  });
});
