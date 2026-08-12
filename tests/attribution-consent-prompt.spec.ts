import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const attributionScript = readFileSync(
  join(process.cwd(), "public", "attribution.js"),
  "utf8",
);

type PromptConfig = {
  enabled: boolean;
  title?: string;
  message?: string;
  acceptLabel?: string;
  declineLabel?: string;
  privacyUrl?: string | null;
  placement?: string;
  theme?: string;
  maxWidth?: number;
  borderRadius?: number;
  backgroundColor?: string | null;
  textColor?: string | null;
  mutedTextColor?: string | null;
  borderColor?: string | null;
  buttonBackgroundColor?: string | null;
  buttonTextColor?: string | null;
  linkColor?: string | null;
};

type PhoneConfig = {
  autoDetect?: boolean;
  replaceTelLinks?: boolean;
  replaceVisibleNumbers?: boolean;
};

async function setupAttributionPage(
  page: Page,
  prompt: PromptConfig,
  phone?: PhoneConfig,
) {
  const leadPayloads: Record<string, unknown>[] = [];
  const phonePayloads: Record<string, unknown>[] = [];
  const corsHeaders = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
  };

  await page.route("https://crm.test/api/attribution/config", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      json: {
        ok: true,
        enabled: true,
        queryParams: ["utm_source", "utm_campaign"],
        phone: {
          autoDetect: false,
          replaceTelLinks: false,
          replaceVisibleNumbers: false,
          ...phone,
        },
        forms: {
          autoTrack: true,
          injectHiddenField: true,
          hiddenFieldName: "crm_attribution",
        },
        consent: {
          required: true,
          storageKey: "id30_tracking_consent",
          prompt: {
            title: "Can we track enquiries?",
            message: "We use tracking to connect website enquiries with marketing activity.",
            acceptLabel: "Allow",
            declineLabel: "No thanks",
            privacyUrl: "/privacy",
            ...prompt,
          },
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

    leadPayloads.push(request.postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      json: { ok: true },
    });
  });

  await page.route("https://crm.test/api/attribution/phone-number", async (route, request) => {
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    phonePayloads.push(request.postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      json: {
        ok: true,
        phoneNumber: "+441484627944",
        trackingPhoneNumber: "+441484627944",
        assignmentId: null,
      },
    });
  });

  await page.route("https://example.test/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `
        <!doctype html>
        <title>Consent prompt fixture</title>
        <script>
          Object.defineProperty(navigator, "sendBeacon", {
            value: undefined,
            configurable: true
          });
        </script>
        <script data-id30-attribution data-api-base="https://crm.test">
          ${attributionScript}
        </script>
        <form>
          <label>Name <input name="name" value="Jane Lead"></label>
          <label>Email <input type="email" name="email" value="jane@example.com"></label>
          <button type="submit">Send</button>
        </form>
        <a href="tel:+443309128279">0330 912 8279</a>
        <p data-crm-phone>0330 912 8279</p>
      `,
    });
  });

  await page.goto("https://example.test/contact?utm_source=search");
  await page.waitForFunction(() => Boolean(window.id30Attribution));

  return { leadPayloads, phonePayloads };
}

test("built-in prompt grants consent and starts tracking", async ({ page }) => {
  const { leadPayloads } = await setupAttributionPage(page, { enabled: true });

  await expect(page.getByRole("dialog", { name: "Attribution tracking consent" })).toBeVisible();
  await expect(page.getByText("Can we track enquiries?")).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();

  await expect(page.getByRole("dialog", { name: "Attribution tracking consent" })).toBeHidden();
  await expect
    .poll(() => page.locator('input[name="crm_attribution"]').count())
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("id30_tracking_consent")))
    .toBe("granted");
  await expect
    .poll(() => page.evaluate(() => Boolean(localStorage.getItem("id30_attribution"))))
    .toBe(true);

  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => leadPayloads.length).toBe(1);
  expect(leadPayloads[0]).toMatchObject({
    name: "Jane Lead",
    email: "jane@example.com",
  });
});

test("built-in prompt decline stores denied preference without tracking", async ({ page }) => {
  await setupAttributionPage(page, { enabled: true });

  const decline = page.getByRole("button", { name: "No thanks" });
  await expect(decline).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(decline).toHaveCSS("text-decoration-line", "underline");
  await decline.click();

  await expect(page.getByRole("dialog", { name: "Attribution tracking consent" })).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("id30_tracking_consent")))
    .toBe("denied");
  expect(await page.evaluate(() => localStorage.getItem("id30_attribution"))).toBeNull();
  await expect(page.locator('input[name="crm_attribution"]')).toHaveCount(0);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.id30Attribution));
  await expect(page.getByRole("dialog", { name: "Attribution tracking consent" })).toHaveCount(0);
});

test("phone number replacement runs before consent without stored attribution", async ({ page }) => {
  const { phonePayloads } = await setupAttributionPage(
    page,
    { enabled: true },
    {
      autoDetect: true,
      replaceTelLinks: true,
      replaceVisibleNumbers: true,
    },
  );

  await expect(page.getByRole("dialog", { name: "Attribution tracking consent" })).toBeVisible();
  await expect.poll(() => phonePayloads.length).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("link", { name: "01484 627944" })).toHaveAttribute(
    "href",
    "tel:+441484627944",
  );
  await expect(page.locator("[data-crm-phone]")).toHaveText("01484 627944");
  expect(phonePayloads[0]).toMatchObject({ displayOnly: true });
  expect(await page.evaluate(() => localStorage.getItem("id30_attribution"))).toBeNull();
  await expect(page.locator('input[name="crm_attribution"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Allow" }).click();
  await expect
    .poll(() => phonePayloads.some((payload) => payload.displayOnly === false))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => Boolean(localStorage.getItem("id30_attribution"))))
    .toBe(true);
});

test("built-in prompt applies placement and style settings", async ({ page }) => {
  await setupAttributionPage(page, {
    enabled: true,
    placement: "top-right",
    theme: "dark",
    maxWidth: 360,
    borderRadius: 4,
    backgroundColor: "#101820",
    textColor: "#f2f5f7",
    mutedTextColor: "#cbd5e1",
    borderColor: "#ffcc00",
    buttonBackgroundColor: "#ffcc00",
    buttonTextColor: "#101820",
    linkColor: "#ffcc00",
  });

  const dialog = page.getByRole("dialog", { name: "Attribution tracking consent" });
  await expect(dialog).toHaveCSS("top", "16px");
  await expect(dialog).toHaveCSS("right", "16px");
  await expect(dialog).toHaveCSS("max-width", "360px");
  await expect(dialog).toHaveCSS("border-radius", "4px");
  await expect(dialog).toHaveCSS("background-color", "rgb(16, 24, 32)");

  await expect(page.getByText("Can we track enquiries?")).toHaveCSS(
    "color",
    "rgb(242, 245, 247)",
  );
  await expect(
    page.getByText("We use tracking to connect website enquiries with marketing activity."),
  ).toHaveCSS("color", "rgb(203, 213, 225)");
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCSS(
    "background-color",
    "rgb(255, 204, 0)",
  );
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCSS(
    "color",
    "rgb(16, 24, 32)",
  );
  await expect(page.getByRole("button", { name: "No thanks" })).toHaveCSS(
    "color",
    "rgb(255, 204, 0)",
  );
});

test("built-in prompt auto theme follows visitor dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await setupAttributionPage(page, {
    enabled: true,
    theme: "auto",
  });

  const dialog = page.getByRole("dialog", { name: "Attribution tracking consent" });
  await expect(dialog).toHaveCSS("background-color", "rgb(17, 24, 39)");
  await expect(page.getByText("Can we track enquiries?")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(
    page.getByText("We use tracking to connect website enquiries with marketing activity."),
  ).toHaveCSS("color", "rgb(209, 213, 219)");
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
});

test("required consent does not show prompt when prompt is disabled", async ({ page }) => {
  await setupAttributionPage(page, { enabled: false });

  await page.waitForTimeout(250);
  await expect(page.getByRole("dialog", { name: "Attribution tracking consent" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("id30_attribution"))).toBeNull();
  expect(
    await page.evaluate(() => {
      const api = window.id30Attribution as { hasConsent?: () => boolean } | undefined;
      return api?.hasConsent?.();
    }),
  ).toBe(false);
});

declare global {
  interface Window {
    id30Attribution?: unknown;
  }
}
