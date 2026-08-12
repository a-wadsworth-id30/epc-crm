import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("captures full same-origin JavaScript form post payloads", async ({ page }) => {
  const attributionScript = readFileSync(
    join(process.cwd(), "public", "attribution.js"),
    "utf8",
  );
  const corsHeaders = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
  };
  const leadPayloads: Array<Record<string, unknown> & { fields?: unknown[] }> = [];

  await page.route("https://crm.test/api/attribution/config", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      json: {
        ok: true,
        enabled: true,
        apiBaseUrl: "https://crm.test",
        forms: {
          autoTrack: true,
          injectHiddenField: true,
          hiddenFieldName: "crm_attribution",
        },
        phone: {
          enabled: false,
          replaceTelLinks: false,
          replaceVisibleNumbers: false,
        },
        consent: {
          requireConsent: false,
          storageKey: "id30_attribution_consent",
        },
        session: {
          timeoutMinutes: 30,
          timelineLimit: 100,
          captureReferrer: true,
        },
      },
    });
  });

  await page.route("https://crm.test/api/attribution/debug", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      json: { ok: true },
    });
  });

  await page.route("https://crm.test/api/attribution/lead", async (route, request) => {
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    leadPayloads.push(
      request.postDataJSON() as Record<string, unknown> & { fields?: unknown[] },
    );
    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      json: { ok: true },
    });
  });

  await page.route("https://example.test/**", async (route, request) => {
    const url = new URL(request.url());

    if (
      url.pathname === "/api/plutio" ||
      url.pathname === "/api/contact" ||
      url.pathname === "/api/enquiry" ||
      url.pathname === "/api/quote"
    ) {
      await route.fulfill({ contentType: "application/json", json: { ok: true } });
      return;
    }

    await route.fulfill({
      contentType: "text/html",
      body: `
        <!doctype html>
        <title>Project enquiry</title>
        <script>
          Object.defineProperty(navigator, "sendBeacon", {
            value: undefined,
            configurable: true
          });
        </script>
        <script data-id30-attribution data-api-base="https://crm.test">
          ${attributionScript}
        </script>
        <script>
          window.submitProjectEnquiry = function () {
            return fetch("/api/plutio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: "Adam Wadsworth",
                telephone: "07394486272",
                email: "a.wadsworth@id30.com",
                "company-name": "iD30",
                "website-url": "https://id30.com",
                "we-sell-provide": "CRM and attribution services",
                description: "We need better project tracking.",
                budget: "10k-25k",
                timeframe: "This quarter",
                day: "Tuesday",
                time: "Morning",
                company_fax: "hidden honeypot",
                turnstileToken: "captcha-token"
              })
            });
          };

          window.submitFormDataEnquiry = function () {
            const formData = new FormData();
            formData.append("full-name", "Jane Lead");
            formData.append("email", "jane@example.com");
            formData.append("mobile", "07700 900123");
            formData.append("company", "Example Co");
            formData.append("message", "Please send the brochure.");
            formData.append("service-interest", "CRM setup");
            formData.append("company_fax", "hidden honeypot");

            return fetch("/api/contact", {
              method: "POST",
              body: formData
            });
          };

          window.submitXhrEnquiry = function () {
            return new Promise((resolve) => {
              const xhr = new XMLHttpRequest();
              xhr.open("POST", "/api/enquiry");
              xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
              xhr.onload = () => resolve(xhr.responseText);
              xhr.send(new URLSearchParams({
                name: "Sam Client",
                email: "sam@example.com",
                telephone: "07123 456789",
                company: "Client Ltd",
                requirements: "Need a callback",
                budget: "5k-10k",
                turnstileToken: "captcha-token"
              }).toString());
            });
          };

          window.submitRequestEnquiry = function () {
            const request = new Request("/api/quote", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: "Riley Prospect",
                email: "riley@example.com",
                phone: "07000 111222",
                company: "Prospect Studio",
                project: "Website attribution rollout"
              })
            });

            return fetch(request);
          };
        </script>
      `,
    });
  });

  await page.goto("https://example.test/contact-us?modal=start-a-project");
  await page.waitForFunction(() => Boolean(window.id30Attribution));
  await page.waitForFunction(() =>
    window.fetch.toString().includes("observeFetchPostLead") &&
      XMLHttpRequest.prototype.send.toString().includes("observeFormPostLead"),
  );
  await page.evaluate(() => window.submitProjectEnquiry());
  await expect.poll(() => leadPayloads.length, { timeout: 5000 }).toBe(1);

  const payload = leadPayloads[0];

  expect(payload).toMatchObject({
    name: "Adam Wadsworth",
    email: "a.wadsworth@id30.com",
    phone: "07394486272",
    companyName: "iD30",
    message: "We need better project tracking.",
    formSource: "json-post",
    formAction: "https://example.test/api/plutio",
  });

  expect(payload.fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Name", value: "Adam Wadsworth" }),
      expect.objectContaining({ label: "Telephone", value: "07394486272" }),
      expect.objectContaining({ label: "Email", value: "a.wadsworth@id30.com" }),
      expect.objectContaining({ label: "Company name", value: "iD30" }),
      expect.objectContaining({ label: "Website url", value: "https://id30.com" }),
      expect.objectContaining({
        label: "We sell provide",
        value: "CRM and attribution services",
      }),
      expect.objectContaining({
        label: "Description",
        value: "We need better project tracking.",
      }),
      expect.objectContaining({ label: "Budget", value: "10k-25k" }),
      expect.objectContaining({ label: "Timeframe", value: "This quarter" }),
      expect.objectContaining({ label: "Day", value: "Tuesday" }),
      expect.objectContaining({ label: "Time", value: "Morning" }),
    ]),
  );
  expect(JSON.stringify(payload.fields)).not.toContain("hidden honeypot");
  expect(JSON.stringify(payload.fields)).not.toContain("captcha-token");

  await page.evaluate(() => window.submitFormDataEnquiry());
  await expect.poll(() => leadPayloads.length, { timeout: 5000 }).toBe(2);

  expect(leadPayloads[1]).toMatchObject({
    name: "Jane Lead",
    email: "jane@example.com",
    phone: "07700 900123",
    companyName: "Example Co",
    message: "Please send the brochure.",
    formSource: "formdata-post",
    formAction: "https://example.test/api/contact",
  });
  expect(leadPayloads[1].fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Service interest", value: "CRM setup" }),
    ]),
  );
  expect(JSON.stringify(leadPayloads[1].fields)).not.toContain("hidden honeypot");

  await page.evaluate(() => window.submitXhrEnquiry());
  await expect.poll(() => leadPayloads.length, { timeout: 5000 }).toBe(3);

  expect(leadPayloads[2]).toMatchObject({
    name: "Sam Client",
    email: "sam@example.com",
    phone: "07123 456789",
    companyName: "Client Ltd",
    formSource: "urlencoded-post",
    formAction: "https://example.test/api/enquiry",
  });
  expect(leadPayloads[2].fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Requirements", value: "Need a callback" }),
      expect.objectContaining({ label: "Budget", value: "5k-10k" }),
    ]),
  );
  expect(JSON.stringify(leadPayloads[2].fields)).not.toContain("captcha-token");

  await page.evaluate(() => window.submitRequestEnquiry());
  await expect.poll(() => leadPayloads.length, { timeout: 5000 }).toBe(4);

  expect(leadPayloads[3]).toMatchObject({
    name: "Riley Prospect",
    email: "riley@example.com",
    phone: "07000 111222",
    companyName: "Prospect Studio",
    message: "Website attribution rollout",
    formSource: "json-post",
    formAction: "https://example.test/api/quote",
  });
});

declare global {
  interface Window {
    id30Attribution?: unknown;
    submitProjectEnquiry: () => Promise<Response>;
    submitFormDataEnquiry: () => Promise<Response>;
    submitXhrEnquiry: () => Promise<unknown>;
    submitRequestEnquiry: () => Promise<Response>;
  }
}
