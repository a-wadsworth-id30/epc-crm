import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowedDashboardWidgetIds,
  defaultDashboardLayout,
  normalizeDashboardLayout,
} from "../src/lib/dashboard/layout";

describe("dashboard layouts", () => {
  it("keeps restricted widgets out of role layouts", () => {
    assert.equal(
      allowedDashboardWidgetIds("sales-user").includes("marketing-snapshot"),
      false,
    );
    assert.equal(
      allowedDashboardWidgetIds("marketing-user").includes("live-calls"),
      false,
    );
    assert.equal(
      allowedDashboardWidgetIds("admin").includes("marketing-snapshot"),
      true,
    );
  });

  it("uses practical role-specific visibility defaults", () => {
    const sales = defaultDashboardLayout("sales-user");
    const marketing = defaultDashboardLayout("marketing-user");

    assert.equal(
      sales.find((item) => item.id === "todays-work")?.visible,
      true,
    );
    assert.equal(
      marketing.find((item) => item.id === "todays-work")?.visible,
      false,
    );
  });

  it("normalizes untrusted saved layouts without losing new widgets", () => {
    const normalized = normalizeDashboardLayout(
      [
        { id: "recent-activity", size: "compact", visible: false },
        { id: "marketing-snapshot", size: "full", visible: true },
        { id: "recent-activity", size: "full", visible: true },
        { id: "not-a-widget", size: "full", visible: true },
      ],
      "sales-user",
    );

    assert.equal(normalized[0]?.id, "recent-activity");
    assert.equal(normalized[0]?.size, "half");
    assert.equal(normalized[0]?.visible, false);
    assert.equal(
      normalized.some((item) => item.id === "marketing-snapshot"),
      false,
    );
    assert.equal(
      normalized.length,
      allowedDashboardWidgetIds("sales-user").length,
    );
    assert.equal(
      new Set(normalized.map((item) => item.id)).size,
      normalized.length,
    );
  });
});
