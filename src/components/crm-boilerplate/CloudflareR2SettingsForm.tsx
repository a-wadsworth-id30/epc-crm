"use client";

import {
  ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { updateCloudflareR2IntegrationAction } from "@/lib/actions/integrations";

export type CloudflareR2Settings = {
  accountId?: string;
  bucketName?: string;
  publicBaseUrl?: string;
  uploadPrefix?: string;
  maxUploadMb?: number;
  allowedMimeTypes?: string;
};

type R2FieldHelp = {
  title: string;
  steps: string[];
  note?: string;
  href?: string;
};

const r2Help: Record<string, R2FieldHelp> = {
  accessKeyId: {
    title: "Where to find the access key ID",
    steps: [
      "Open Cloudflare Dashboard > Storage & databases > R2.",
      "Select Manage R2 API tokens, then create an account or user API token.",
      "Choose Object Read & Write and scope it to the bucket used by this CRM.",
      "Copy Access Key ID from the token result screen.",
    ],
    note: "Use a bucket-scoped token where possible. This is safer than account-wide access.",
    href: "https://developers.cloudflare.com/r2/get-started/s3/",
  },
  secretAccessKey: {
    title: "Where to find the secret access key",
    steps: [
      "Create the same R2 API token used for the access key ID.",
      "Copy Secret Access Key from the final token screen.",
      "Paste it here immediately; Cloudflare will not show the secret again.",
    ],
    note: "The CRM encrypts this before saving it. Leave the field blank later to keep the saved value.",
    href: "https://developers.cloudflare.com/r2/get-started/s3/",
  },
  accountId: {
    title: "Where to find the account ID",
    steps: [
      "In Cloudflare, open the account that owns the R2 bucket.",
      "Go to Storage & databases > R2, or use the account sidebar/overview.",
      "Copy the Account ID for the account, not the zone ID for a website.",
    ],
    note: "This forms the S3 endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com.",
    href: "https://developers.cloudflare.com/r2/api/s3/api/",
  },
  bucketName: {
    title: "Where to find the bucket name",
    steps: [
      "Open Cloudflare Dashboard > Storage & databases > R2 > Overview.",
      "Use the exact bucket name shown in the bucket list.",
      "Make sure the API token above is allowed to read and write to this bucket.",
    ],
    note: "Bucket names are case-sensitive in practice for integrations. Copy the value rather than retyping it.",
  },
  uploadPrefix: {
    title: "What upload prefix does",
    steps: [
      "This is a folder-style prefix inside the bucket, such as crm-assets.",
      "Cloudflare setup is not required for it.",
      "Change it only if you want this CRM's files grouped under a different bucket path.",
    ],
    note: "Keep this stable after launch so existing file paths remain predictable.",
  },
  maxUploadMb: {
    title: "What max upload MB does",
    steps: [
      "This is CRM-side validation before upload.",
      "Set it to the largest file size agents should upload for this client.",
      "Use a smaller value for document/photo storage to keep workflows quick.",
    ],
    note: "This does not change Cloudflare account limits.",
  },
  publicBaseUrl: {
    title: "Where to find the public URL",
    steps: [
      "Open the R2 bucket, then go to Settings.",
      "For production, add a Custom Domain and use that HTTPS URL.",
      "For development only, you can enable the r2.dev public URL.",
    ],
    note: "Use a custom domain for client CRMs. r2.dev is intended for non-production traffic.",
    href: "https://developers.cloudflare.com/r2/buckets/public-buckets/",
  },
  allowedMimeTypes: {
    title: "What allowed MIME types does",
    steps: [
      "This is CRM-side validation for accepted file types.",
      "Use comma-separated MIME types, for example image/*,application/pdf.",
      "Add client-specific types only when the CRM workflow needs them.",
    ],
    note: "Cloudflare may still need CORS configured for browser uploads using presigned URLs.",
    href: "https://developers.cloudflare.com/r2/buckets/cors/",
  },
};

function R2HelpPopover({ help }: { help: R2FieldHelp }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        close();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isOpen]);

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Help: ${help.title}`}
        aria-expanded={isOpen}
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 text-[11px] leading-none font-semibold text-gray-500 transition hover:border-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:ring-2 focus:ring-brand-500/30 focus:outline-none dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
        onClick={() => setIsOpen((current) => !current)}
      >
        ?
      </button>
      {isOpen && (
        <div
          role="dialog"
          aria-label={help.title}
          className="absolute top-full left-0 z-99999 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-900"
        >
          <p className="font-medium text-gray-800 dark:text-white/90">
            {help.title}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-gray-600 dark:text-gray-300">
            {help.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {help.note && (
            <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {help.note}
            </p>
          )}
          {help.href && (
            <a
              href={help.href}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              Open Cloudflare docs
            </a>
          )}
          <span className="absolute -top-1.5 left-3 h-3 w-3 rotate-45 border-t border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
        </div>
      )}
    </span>
  );
}

function FieldLabel({
  htmlFor,
  children,
  help,
}: {
  htmlFor: string;
  children: ReactNode;
  help: R2FieldHelp;
}) {
  return (
    <div className="mb-1.5 flex items-center">
      <Label htmlFor={htmlFor} className="mb-0">
        {children}
      </Label>
      <R2HelpPopover help={help} />
    </div>
  );
}

export default function CloudflareR2SettingsForm({
  config,
  hasStoredCredentials,
  hasEncryptionKey,
  canEdit,
  mode = "full",
  onSaved,
}: {
  config: CloudflareR2Settings;
  hasStoredCredentials: boolean;
  hasEncryptionKey: boolean;
  canEdit: boolean;
  mode?: "connection" | "full";
  onSaved?: (connected: boolean) => void;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    updateCloudflareR2IntegrationAction,
    {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
    },
  );

  useEffect(() => {
    if (!state.ok || state.savedAt === null) {
      return;
    }

    showToast(state.message || "Cloudflare R2 settings saved.");
    queueMicrotask(() => {
      setIsDirty(false);
      onSaved?.(state.connected);
    });
  }, [
    onSaved,
    showToast,
    state.connected,
    state.message,
    state.ok,
    state.savedAt,
  ]);

  if (mode === "connection") {
    return (
      <form
        action={formAction}
        onChangeCapture={() => setIsDirty(true)}
        className="space-y-5"
      >
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Credential storage
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Only the storage connection details live here. Upload policy is configured under Storage.
              </p>
            </div>
            <span
              className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
                hasStoredCredentials
                  ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                  : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
              }`}
            >
              {hasStoredCredentials ? "Credentials saved" : "Credentials missing"}
            </span>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {hasEncryptionKey ? (
              "Leave the key fields blank to keep existing credentials."
            ) : (
              <>
                Set <code>CREDENTIAL_ENCRYPTION_KEY</code> before saving
                credentials.
              </>
            )}
          </p>
        </div>

        <input type="hidden" name="uploadPrefix" value={config.uploadPrefix ?? "crm-assets"} />
        <input type="hidden" name="maxUploadMb" value={config.maxUploadMb ?? 25} />
        <input type="hidden" name="publicBaseUrl" value={config.publicBaseUrl ?? ""} />
        <input
          type="hidden"
          name="allowedMimeTypes"
          value={config.allowedMimeTypes ?? "image/*,application/pdf"}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="r2-access-key-id" help={r2Help.accessKeyId}>
              Access key ID
            </FieldLabel>
            <Input
              id="r2-access-key-id"
              name="accessKeyId"
              autoComplete="off"
              placeholder={hasStoredCredentials ? "Saved - leave blank to keep" : ""}
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="r2-secret-access-key"
              help={r2Help.secretAccessKey}
            >
              Secret access key
            </FieldLabel>
            <Input
              id="r2-secret-access-key"
              name="secretAccessKey"
              type="password"
              autoComplete="new-password"
              placeholder={hasStoredCredentials ? "Saved - leave blank to keep" : ""}
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="r2-account-id" help={r2Help.accountId}>
              Account ID
            </FieldLabel>
            <Input
              id="r2-account-id"
              name="accountId"
              defaultValue={config.accountId ?? ""}
              disabled={!canEdit}
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="r2-bucket-name" help={r2Help.bucketName}>
              Bucket name
            </FieldLabel>
            <Input
              id="r2-bucket-name"
              name="bucketName"
              defaultValue={config.bucketName ?? ""}
              disabled={!canEdit}
              required
            />
          </div>
        </div>

        <div className="space-y-4">
          <ActionStateMessage state={state.ok ? undefined : state} />
          <button
            type="submit"
            disabled={!canEdit || isPending || !isDirty}
            className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save R2 connection"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      action={formAction}
      onChangeCapture={() => setIsDirty(true)}
      className="space-y-5"
    >
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              Credential storage
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              R2 credentials are entered here and encrypted before being saved.
            </p>
          </div>
          <span
            className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
              hasStoredCredentials
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
            }`}
          >
            {hasStoredCredentials ? "Credentials saved" : "Credentials missing"}
          </span>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {hasEncryptionKey ? (
            "Leave the key fields blank to keep existing credentials."
          ) : (
            <>
              Set <code>CREDENTIAL_ENCRYPTION_KEY</code> before saving
              credentials.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="r2-access-key-id" help={r2Help.accessKeyId}>
            Access key ID
          </FieldLabel>
          <Input
            id="r2-access-key-id"
            name="accessKeyId"
            autoComplete="off"
            placeholder={
              hasStoredCredentials ? "Saved - leave blank to keep" : ""
            }
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="r2-secret-access-key"
            help={r2Help.secretAccessKey}
          >
            Secret access key
          </FieldLabel>
          <Input
            id="r2-secret-access-key"
            name="secretAccessKey"
            type="password"
            autoComplete="new-password"
            placeholder={
              hasStoredCredentials ? "Saved - leave blank to keep" : ""
            }
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel htmlFor="r2-account-id" help={r2Help.accountId}>
            Account ID
          </FieldLabel>
          <Input
            id="r2-account-id"
            name="accountId"
            defaultValue={config.accountId ?? ""}
            disabled={!canEdit}
            required
          />
        </div>
        <div>
          <FieldLabel htmlFor="r2-bucket-name" help={r2Help.bucketName}>
            Bucket name
          </FieldLabel>
          <Input
            id="r2-bucket-name"
            name="bucketName"
            defaultValue={config.bucketName ?? ""}
            disabled={!canEdit}
            required
          />
        </div>
        <div>
          <FieldLabel htmlFor="r2-upload-prefix" help={r2Help.uploadPrefix}>
            Upload prefix
          </FieldLabel>
          <Input
            id="r2-upload-prefix"
            name="uploadPrefix"
            defaultValue={config.uploadPrefix ?? "crm-assets"}
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel htmlFor="r2-max-upload" help={r2Help.maxUploadMb}>
            Max upload MB
          </FieldLabel>
          <Input
            id="r2-max-upload"
            name="maxUploadMb"
            type="number"
            min={1}
            max={500}
            defaultValue={config.maxUploadMb ?? 25}
            disabled={!canEdit}
          />
        </div>
        <div className="md:col-span-2">
          <FieldLabel htmlFor="r2-public-base-url" help={r2Help.publicBaseUrl}>
            Public/custom base URL
          </FieldLabel>
          <Input
            id="r2-public-base-url"
            name="publicBaseUrl"
            type="url"
            placeholder="https://files.example.com"
            defaultValue={config.publicBaseUrl ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div className="md:col-span-2">
          <FieldLabel htmlFor="r2-allowed-types" help={r2Help.allowedMimeTypes}>
            Allowed MIME types
          </FieldLabel>
          <Input
            id="r2-allowed-types"
            name="allowedMimeTypes"
            defaultValue={config.allowedMimeTypes ?? "image/*,application/pdf"}
            disabled={!canEdit}
          />
        </div>
      </div>

      <div className="space-y-4">
        <ActionStateMessage state={state.ok ? undefined : state} />
        <button
          type="submit"
          disabled={!canEdit || isPending || !isDirty}
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Cloudflare R2 settings"}
        </button>
      </div>
    </form>
  );
}
