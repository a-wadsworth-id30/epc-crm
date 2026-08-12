import assert from "node:assert/strict";
import { calculateAttributionConfidence } from "../src/lib/marketing/attribution-confidence";

const high = calculateAttributionConfidence({
  firstTouch: {
    landingPage: "https://example.com/landing",
    params: {
      gclid: "test-click",
      utm_campaign: "brand-search",
      utm_source: "google",
    },
  },
  timeline: [{ url: "https://example.com/landing" }],
  recordsCount: 1,
  matchedOpportunityId: "opp_123",
});

assert.equal(high.level, "High");
assert.equal(high.percentage, 100);
assert.deepEqual(
  high.missingFactors.map((factor) => factor.key),
  [],
);

const medium = calculateAttributionConfidence({
  firstTouch: {
    landingPage: "https://example.com/contact",
    params: {
      utm_source: "organic",
    },
  },
  timeline: [{ url: "https://example.com/contact" }],
  formConversionsCount: 1,
});

assert.equal(medium.level, "Medium");
assert.ok(medium.percentage >= 45 && medium.percentage < 75);
assert.ok(medium.missingFactors.some((factor) => factor.key === "click-id"));

const low = calculateAttributionConfidence({
  referrer: "https://example-referrer.com",
});

assert.equal(low.level, "Low");
assert.ok(low.missingFactors.length > low.presentFactors.length);

const unknown = calculateAttributionConfidence({});

assert.equal(unknown.level, "Unknown");
assert.equal(unknown.percentage, 0);

const consentRequired = calculateAttributionConfidence({
  consentRequired: true,
  consentGranted: false,
  firstTouch: {
    params: {
      utm_source: "google",
    },
  },
});

assert.ok(consentRequired.factors.some(
  (factor) => factor.key === "consent" && factor.status === "missing",
));

console.log("Attribution confidence checks passed.");
