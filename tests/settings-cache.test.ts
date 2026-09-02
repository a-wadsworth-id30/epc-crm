import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crmSettingsCacheRevalidateSeconds } from "../src/lib/settings-cache";

describe("CRM settings cache duration", () => {
  it("defaults global settings caches to one hour", () => {
    assert.equal(crmSettingsCacheRevalidateSeconds({}), 3600);
  });

  it("allows longer operator-tuned cache windows", () => {
    assert.equal(
      crmSettingsCacheRevalidateSeconds({
        CRM_SETTINGS_CACHE_REVALIDATE_SECONDS: "7200",
      }),
      7200,
    );
  });

  it("keeps the cache window at least five minutes", () => {
    assert.equal(
      crmSettingsCacheRevalidateSeconds({
        CRM_SETTINGS_CACHE_REVALIDATE_SECONDS: "30",
      }),
      300,
    );
  });

  it("falls back to the default for invalid values", () => {
    assert.equal(
      crmSettingsCacheRevalidateSeconds({
        CRM_SETTINGS_CACHE_REVALIDATE_SECONDS: "not-a-number",
      }),
      3600,
    );
  });

  it("falls back to the default for blank values", () => {
    assert.equal(
      crmSettingsCacheRevalidateSeconds({
        CRM_SETTINGS_CACHE_REVALIDATE_SECONDS: " ",
      }),
      3600,
    );
  });
});
