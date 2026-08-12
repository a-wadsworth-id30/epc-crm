import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAuthBrokerConversionUploadPayload } from "../src/lib/marketing/auth-broker-conversion-payload";

const baseRow = {
  clickId: "click-123",
  clickIdSource: "gclid",
  conversionName: "Submitted lead",
  conversionType: "lead",
  currency: "GBP",
  entityId: "lead_123",
  entityType: "lead",
  occurredAt: new Date("2026-07-24T09:30:00.000Z"),
  payload: {},
  valueCents: 12500,
};

function mapping(payload: Record<string, unknown>) {
  return payload.mapping as Record<string, unknown>;
}

describe("Auth broker conversion upload payloads", () => {
  it("sends only whitelisted Meta mapping fields to Auth", () => {
    const payload = buildAuthBrokerConversionUploadPayload({
      row: {
        ...baseRow,
        payload: {
          accessToken: "row-secret",
          eventName: "RowLead",
          pixelId: "row-pixel",
          selectorOptions: { accounts: [{ id: "act_123" }] },
        },
      },
      context: {
        provider: "Meta",
        slug: "meta",
        config: {
          authBroker: { connectionId: "auth_connection_123" },
          callEventName: "Contact",
          leadEventName: "Lead",
          pixelId: "config-pixel",
          selectorOptions: { pixels: [{ id: "config-pixel" }] },
          testEventCode: " TEST123 ",
          token: "config-secret",
        },
      },
    });

    assert.deepEqual(mapping(payload), {
      provider: "Meta",
      providerSlug: "meta",
      pixelId: "config-pixel",
      eventName: "RowLead",
      leadEventName: "Lead",
      callEventName: "Contact",
      testEventCode: "TEST123",
    });
  });

  it("keeps provider-specific upload fields and drops unrelated config", () => {
    const payload = buildAuthBrokerConversionUploadPayload({
      row: {
        ...baseRow,
        payload: {
          callConversionActionId: "row-call-action",
          conversionActionId: "row-generic-action",
          credentials: { refreshToken: "secret" },
          managerCustomerId: "1112223333",
        },
      },
      context: {
        provider: "Google Ads",
        slug: "google-ads",
        config: {
          accountName: "Client Google Ads",
          authBroker: { connectionId: "auth_connection_456" },
          callConversionActionId: "",
          customerId: "1234567890",
          importCostEnabled: true,
          leadConversionActionId: "config-lead-action",
          selectorOptions: { accounts: [{ id: "1234567890" }] },
        },
      },
    });

    assert.deepEqual(mapping(payload), {
      provider: "Google Ads",
      providerSlug: "google-ads",
      customerId: "1234567890",
      managerCustomerId: "1112223333",
      conversionActionId: "row-generic-action",
      leadConversionActionId: "config-lead-action",
    });
  });
});
