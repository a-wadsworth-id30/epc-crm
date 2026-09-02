import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBrowserSoftphoneCapable,
  usesBrowserSoftphoneRoutingMode,
} from "../src/lib/telephony/softphone-capability";

describe("browser softphone capability", () => {
  it("allows browser and Flex users with an assigned extension", () => {
    assert.equal(
      isBrowserSoftphoneCapable({
        status: "ACTIVE",
        voiceExtension: "1001",
        voiceRoutingMode: "BROWSER",
      }),
      true,
    );
    assert.equal(
      isBrowserSoftphoneCapable({
        status: "ACTIVE",
        voiceExtension: "2002",
        voiceRoutingMode: "FLEX",
      }),
      true,
    );
  });

  it("does not allow browser users without an extension", () => {
    assert.equal(
      isBrowserSoftphoneCapable({
        status: "ACTIVE",
        voiceExtension: " ",
        voiceRoutingMode: "BROWSER",
      }),
      false,
    );
  });

  it("does not allow inactive or non-browser routing modes", () => {
    assert.equal(
      isBrowserSoftphoneCapable({
        status: "INACTIVE",
        voiceExtension: "1001",
        voiceRoutingMode: "BROWSER",
      }),
      false,
    );
    assert.equal(
      isBrowserSoftphoneCapable({
        status: "ACTIVE",
        voiceExtension: "1001",
        voiceRoutingMode: "MOBILE",
      }),
      false,
    );
  });

  it("keeps the routing mode predicate narrow", () => {
    assert.equal(usesBrowserSoftphoneRoutingMode("BROWSER"), true);
    assert.equal(usesBrowserSoftphoneRoutingMode("FLEX"), true);
    assert.equal(usesBrowserSoftphoneRoutingMode("SIP"), false);
  });
});
