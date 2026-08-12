import { z } from "zod";

export type BrowserExtensionSettings = {
  chromeWebStoreUrl: string | null;
  chromeWebStoreId: string | null;
  updatedAt: string | null;
};

const browserExtensionSettingsSchema = z
  .object({
    chromeWebStoreUrl: z.string().url().nullable().optional(),
    chromeWebStoreId: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough();

export function parseBrowserExtensionSettings(
  value: unknown,
): BrowserExtensionSettings {
  const parsed = browserExtensionSettingsSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return emptyBrowserExtensionSettings();
  }

  return {
    chromeWebStoreUrl: parsed.data.chromeWebStoreUrl ?? null,
    chromeWebStoreId: parsed.data.chromeWebStoreId ?? null,
    updatedAt: parsed.data.updatedAt ?? null,
  };
}

export function emptyBrowserExtensionSettings(): BrowserExtensionSettings {
  return {
    chromeWebStoreUrl: null,
    chromeWebStoreId: null,
    updatedAt: null,
  };
}

export function extractChromeWebStoreId(url: string) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const detailIndex = parts.indexOf("detail");

    if (detailIndex === -1) {
      return null;
    }

    return parts[detailIndex + 2] ?? parts[detailIndex + 1] ?? null;
  } catch {
    return null;
  }
}

export function isChromeWebStoreInstallUrl(url: string) {
  try {
    const parsed = new URL(url);
    const validHost =
      parsed.hostname === "chromewebstore.google.com" ||
      parsed.hostname === "chrome.google.com";

    return validHost && parsed.pathname.includes("/detail/");
  } catch {
    return false;
  }
}
