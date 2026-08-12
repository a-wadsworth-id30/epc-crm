import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMarketingIntegrationCredentialState,
  hasLinkedInAdsConnection,
  linkedInAdsConfigSchema,
  type MarketingProviderSelectorOptions,
} from "../src/lib/marketing/integrations";
import { withConfiguredMarketingProviderSelections } from "../src/lib/marketing/selector-options";

function selectorOptions(config: Record<string, unknown>) {
  return config.selectorOptions as MarketingProviderSelectorOptions;
}

describe("marketing selector option persistence", () => {
  it("keeps a configured Google Ads account in refreshed selector options", () => {
    const config = withConfiguredMarketingProviderSelections("google-ads", {
      customerId: "123-456-7890",
      accountName: "Client Google Ads",
      selectorOptions: {
        accounts: [{ id: "1111111111", name: "Other account" }],
      },
    });

    assert.deepEqual(
      selectorOptions(config).accounts?.map((option) => [option.id, option.name]),
      [
        ["1111111111", "Other account"],
        ["1234567890", "Client Google Ads"],
      ],
    );
  });

  it("derives equivalent Meta account option matches without duplicating act_ IDs", () => {
    const config = withConfiguredMarketingProviderSelections("meta", {
      adAccountId: "987654321",
      accountName: "Client Meta",
      selectorOptions: {
        accounts: [{ id: "act_987654321", name: "Client Meta" }],
      },
    });

    assert.deepEqual(selectorOptions(config).accounts, [
      { id: "act_987654321", name: "Client Meta" },
    ]);
  });

  it("keeps configured Bing account and conversion mappings when Auth returns empty options", () => {
    const config = withConfiguredMarketingProviderSelections("bing-ads", {
      accountId: "222333444",
      accountName: "Client Microsoft Ads",
      customerId: "555666777",
      leadConversionGoalId: "888999000",
      leadConversionGoalName: "Submitted lead",
      selectorOptions: {
        accounts: [],
        conversionGoals: [],
        managerAccounts: [],
      },
    });

    const options = selectorOptions(config);

    assert.equal(options.accounts?.[0]?.id, "222333444");
    assert.equal(options.accounts?.[0]?.name, "Client Microsoft Ads");
    assert.equal(options.managerAccounts?.[0]?.id, "555666777");
    assert.equal(options.conversionGoals?.[0]?.id, "888999000");
    assert.equal(options.conversionGoals?.[0]?.name, "Submitted lead");
  });

  it("treats saved Bing conversion goal IDs as setup mapping even when upload names are absent", () => {
    const state = getMarketingIntegrationCredentialState(
      "bing-ads",
      {
        accountId: "222333444",
        accountName: null,
        customerId: "555666777",
        managerAccountId: null,
        uetTagId: null,
        leadConversionGoalId: "888999000",
        leadConversionGoalName: null,
        callConversionGoalId: null,
        callConversionGoalName: null,
        importCostEnabled: false,
        selectorOptions: {},
        uploadOfflineConversionsEnabled: true,
        trackedClickIds: ["msclkid"],
        authBroker: {
          status: "connected",
          connectionId: "auth_connection_123",
        },
      },
      { authBrokerConfigured: true },
    );

    assert.equal(state.conversionMapped, true);
    assert.equal(state.uploadReady, false);
    assert.equal(
      state.items.find((item) => item.label === "Conversion mapping")?.detail,
      "Conversion goal ID mapped",
    );
    assert.equal(
      state.items.find((item) => item.label === "Upload conversion name")?.ready,
      false,
    );
  });

  it("allows LinkedIn Ads account mapping to be intentionally blank", () => {
    const parsed = linkedInAdsConfigSchema.safeParse({
      adAccountId: "",
      accountMappingResetAt: "2026-07-24T09:00:00.000Z",
      accountName: null,
      callConversionRuleId: null,
      importCostEnabled: false,
      insightTagId: null,
      leadConversionRuleId: null,
      selectorOptions: {
        accounts: [{ id: "123", name: "Client LinkedIn Ads" }],
      },
      trackedClickIds: "",
      uploadOfflineConversionsEnabled: false,
    });

    assert.ok(parsed.success);
    assert.equal(parsed.data.adAccountId, null);
    assert.equal(hasLinkedInAdsConnection(parsed.data), false);
  });
});
