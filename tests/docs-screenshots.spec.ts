import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const screenshotDir =
  process.env.DOCS_SCREENSHOT_DIR ??
  (process.env.DOCS_SCREENSHOTS_WRITE_REPO === "true"
    ? "docs/assets/screenshots"
    : "/private/tmp/id30-crm-docs-screenshots");
const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

test("generate user documentation screenshots", async ({ page }) => {
  mkdirSync(screenshotDir, { recursive: true });

  await page.goto("/signin");
  await page.screenshot({ path: `${screenshotDir}/login.png`, fullPage: true });

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/dashboard.png`, fullPage: true });

  for (const [path, file, heading] of [
    ["/clients", "clients.png", "Companies"],
    ["/contacts", "contacts.png", "Contacts"],
    ["/tasks", "tasks.png", "Tasks"],
    ["/settings/integrations", "integrations.png", "Integrations"],
    ["/settings/users", "users.png", "Users & Permissions"],
    ["/profile", "profile.png", "Profile"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/${file}`, fullPage: true });
  }
});
