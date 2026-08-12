"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import ChromeExtensionInstallStatus from "@/components/crm-boilerplate/ChromeExtensionInstallStatus";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { updateBrowserExtensionSettingsAction } from "@/lib/actions/settings";
import type { BrowserExtensionSettings } from "@/lib/browser-extension/settings";

type ModalName = "install" | "publish" | null;

const extensionZipUrl = "/downloads/id30-crm-chrome-softphone.zip";
const chromeStoreAssetLinks = [
  {
    label: "Icon image",
    href: "/downloads/chrome-store-assets/id30-crm-softphone-icon-128.png",
    detail: "128x128 PNG",
  },
  {
    label: "Screenshot 1",
    href: "/downloads/chrome-store-assets/screenshot-1-softphone-incoming-1280x800.png",
    detail: "1280x800 PNG",
  },
  {
    label: "Screenshot 2",
    href: "/downloads/chrome-store-assets/screenshot-2-sidepanel-controls-1280x800.png",
    detail: "1280x800 PNG",
  },
  {
    label: "Small promo image",
    href: "/downloads/chrome-store-assets/small-promo-440x280.png",
    detail: "440x280 PNG",
  },
];

export default function BrowserExtensionSettingsPanel({
  appBaseUrl,
  settings,
}: {
  appBaseUrl: string;
  settings: BrowserExtensionSettings;
}) {
  const { showToast } = useToast();
  const [modal, setModal] = useState<ModalName>(null);
  const [chromeWebStoreUrl, setChromeWebStoreUrl] = useState(
    settings.chromeWebStoreUrl ?? "",
  );
  const [savedChromeWebStoreUrl, setSavedChromeWebStoreUrl] = useState(
    settings.chromeWebStoreUrl ?? "",
  );
  const [state, formAction, isPending] = useActionState(
    updateBrowserExtensionSettingsAction,
    {
      ok: false,
      message: "",
      savedAt: null,
    },
  );

  useEffect(() => {
    if (!state.ok) return;

    const savedUrl = chromeWebStoreUrl.trim();
    queueMicrotask(() => {
      setSavedChromeWebStoreUrl(savedUrl);
    });
    showToast(state.message || "Browser extension settings saved.");
  }, [chromeWebStoreUrl, showToast, state.message, state.ok, state.savedAt]);

  const hasStoreUrl = Boolean(savedChromeWebStoreUrl);
  const isDirty = chromeWebStoreUrl.trim() !== savedChromeWebStoreUrl;
  const primaryActionLabel = hasStoreUrl ? "Install extension" : "Download extension";
  const installModeLabel = hasStoreUrl
    ? "Chrome Web Store install"
    : "Manual package install";
  const privacyPolicyUrl = `${appBaseUrl.replace(/\/$/, "")}/privacy/chrome-softphone`;

  const installSteps = useMemo(
    () =>
      hasStoreUrl
        ? [
            "Open the approved Chrome Web Store listing.",
            "Click Add to Chrome.",
            "Confirm Add extension when Chrome asks for permissions.",
            "Open the CRM and sign in.",
            "Click the extension icon to open the browser-level softphone window.",
            "Keep that softphone window open while you want to receive browser softphone calls.",
          ]
        : [
            "Download the extension ZIP from this CRM.",
            "Unzip the package on your computer.",
            "Open chrome://extensions in Chrome.",
            "Enable Developer mode.",
            "Choose Load unpacked and select the unzipped extension folder.",
            "Open the CRM and sign in.",
            "Click the extension icon to open the browser-level softphone window.",
          ],
    [hasStoreUrl],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Browser softphone extension
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Configure how users install the optional Chrome extension. When an
              approved Chrome Web Store URL is saved, the CRM switches from
              manual ZIP instructions to Store install instructions.
            </p>
          </div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
              hasStoreUrl
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
            }`}
          >
            {installModeLabel}
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form action={formAction} className="space-y-3">
            <label
              htmlFor="chromeWebStoreUrl"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Chrome Web Store URL
            </label>
            <input
              id="chromeWebStoreUrl"
              name="chromeWebStoreUrl"
              type="url"
              value={chromeWebStoreUrl}
              onChange={(event) => setChromeWebStoreUrl(event.target.value)}
              placeholder="https://chromewebstore.google.com/detail/..."
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
            />
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
              Leave empty until the extension has been approved by Google. Paste
              the public or unlisted Store listing URL once available.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <ActionStateMessage state={!state.ok ? state : undefined} />
              <button
                type="submit"
                disabled={isPending || !isDirty}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save install URL"}
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Current install action
            </p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {hasStoreUrl
                ? "Users install from the approved Chrome Web Store listing."
                : "Users install manually from the CRM package while Store approval is pending."}
            </p>
            <div className="mt-4 grid gap-2">
              {hasStoreUrl ? (
                <a
                  href={savedChromeWebStoreUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
                >
                  {primaryActionLabel}
                </a>
              ) : (
                <a
                  href={extensionZipUrl}
                  download
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
                >
                  {primaryActionLabel}
                </a>
              )}
              <button
                type="button"
                onClick={() => setModal("install")}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Installation instructions
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Publishing support
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                Use these assets and checklist while the extension is awaiting
                Chrome Web Store approval.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModal("publish")}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              Publishing checklist
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {chromeStoreAssetLinks.map((asset) => (
              <a
                key={asset.href}
                href={asset.href}
                download
                className="rounded-xl border border-gray-200 bg-gray-50 p-3 transition hover:border-brand-200 hover:bg-brand-50/50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40"
              >
                <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
                  {asset.label}
                </span>
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  {asset.detail}
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Browser detection
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            This detects whether the current browser has the extension running.
          </p>
          <div className="mt-4">
            <ChromeExtensionInstallStatus />
          </div>
        </section>
      </div>

      <InstructionModal
        open={modal === "install"}
        title={hasStoreUrl ? "Install from Chrome Web Store" : "Install manually"}
        onClose={() => setModal(null)}
      >
        <InstructionList items={installSteps} />
        <div className="mt-5">
          {hasStoreUrl ? (
            <a
              href={savedChromeWebStoreUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Open Chrome Web Store
            </a>
          ) : (
            <a
              href={extensionZipUrl}
              download
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Download package
            </a>
          )}
        </div>
      </InstructionModal>

      <InstructionModal
        open={modal === "publish"}
        title="Chrome Web Store publishing checklist"
        onClose={() => setModal(null)}
      >
        <InstructionList
          items={[
            "Upload the extension ZIP as the package.",
            "Add the 128x128 PNG icon on the Store Listing tab.",
            "Upload at least one screenshot or video.",
            "Add the 440x280 small promotional image if requested.",
            `Paste the privacy policy URL: ${privacyPolicyUrl}`,
            "Complete the Data usage checklist and permission justifications.",
            "Add and verify the publisher contact email in Developer Dashboard Settings.",
            "Choose Unlisted distribution unless this CRM should be publicly searchable.",
            "After approval, paste the Store listing URL into this settings page.",
          ]}
        />
      </InstructionModal>
    </div>
  );
}

function InstructionModal({
  children,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-999999 flex items-center justify-center bg-gray-950/50 px-4 py-8">
      <div className="max-h-[calc(100vh-4rem)] w-full max-w-2xl overflow-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05]"
            aria-label="Close"
          >
            x
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function InstructionList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={item} className="flex gap-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}
