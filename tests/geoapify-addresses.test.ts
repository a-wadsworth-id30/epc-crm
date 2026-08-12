import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeGeoapifyAddressResults } from "../src/lib/integrations/geoapify-addresses";

describe("Geoapify address normalization", () => {
  it("maps structured Geoapify address fields to CRM address fields", () => {
    const suggestions = normalizeGeoapifyAddressResults([
      {
        place_id: "abc123",
        formatted: "10 Downing Street, London SW1A 2AA, United Kingdom",
        address_line1: "10 Downing Street",
        address_line2: "Westminster, London",
        city: "London",
        county: "Greater London",
        postcode: "SW1A 2AA",
        country: "United Kingdom",
      },
    ]);

    assert.deepEqual(suggestions, [
      {
        id: "abc123",
        label: "10 Downing Street, London SW1A 2AA, United Kingdom",
        addressLine1: "10 Downing Street",
        addressLine2: "Westminster, London",
        city: "London",
        county: "Greater London",
        postcode: "SW1A 2AA",
        country: "United Kingdom",
      },
    ]);
  });

  it("falls back to house number and street when address_line1 is missing", () => {
    const suggestions = normalizeGeoapifyAddressResults([
      {
        formatted: "1 High Street, York, United Kingdom",
        housenumber: "1",
        street: "High Street",
        town: "York",
        state: "North Yorkshire",
        postcode: "YO1 1AA",
        country: "United Kingdom",
      },
    ]);

    assert.equal(suggestions[0]?.addressLine1, "1 High Street");
    assert.equal(suggestions[0]?.city, "York");
    assert.equal(suggestions[0]?.county, "North Yorkshire");
  });

  it("caps normalized results at the requested limit", () => {
    const suggestions = normalizeGeoapifyAddressResults(
      [
        { formatted: "One" },
        { formatted: "Two" },
        { formatted: "Three" },
      ],
      2,
    );

    assert.deepEqual(
      suggestions.map((suggestion) => suggestion.label),
      ["One", "Two"],
    );
  });
});
