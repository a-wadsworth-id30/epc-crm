import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  notificationCategoryDefinitions,
  parseNotificationDefaults,
  shouldShowNotification,
} from "../src/lib/notification-defaults";

describe("header notification defaults", () => {
  it("includes inbound email alerts by default for existing settings", () => {
    const defaults = parseNotificationDefaults({
      categories: { Sales: false },
    });

    assert.equal(defaults.categories.Email, true);
    assert.equal(defaults.categories.Sales, false);
    assert.ok(
      notificationCategoryDefinitions.some(
        (category) => category.key === "Email",
      ),
    );
  });

  it("allows non-critical email notifications to be disabled", () => {
    const defaults = parseNotificationDefaults({
      categories: { Email: false },
    });

    assert.equal(
      shouldShowNotification(
        { category: "Email", severity: "warning" },
        defaults,
      ),
      false,
    );
  });
});
