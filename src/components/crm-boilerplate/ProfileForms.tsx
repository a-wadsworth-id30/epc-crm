"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import ImageUploadDropzone from "@/components/crm-boilerplate/ImageUploadDropzone";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { PlusIcon, TrashBinIcon } from "@/icons";
import {
  beginTwoFactorSetupAction,
  changeOwnPasswordAction,
  disableTwoFactorAction,
  enableTwoFactorAction,
  removeProfileAvatarAction,
  requestAccountRemovalAction,
  revokeOtherSessionsAction,
  revokeOwnSessionAction,
  selectProfileAvatarAction,
  updateProfileAction,
  uploadProfileAvatarAction,
} from "@/lib/actions/auth";

export type AvatarMediaItem = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
};

export type UserSessionListItem = {
  browserLabel: string;
  createdAtLabel: string;
  expiresAtLabel: string;
  id: string;
  ipAddressLabel: string;
  isCurrent: boolean;
  lastSeenAtLabel: string;
  status: string;
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function ProfileAvatarManager({
  avatarUrl,
  fallback,
  media,
}: {
  avatarUrl?: string | null;
  fallback: string;
  media: AvatarMediaItem[];
}) {
  const modal = useModal();
  const { closeModal, isOpen, openModal } = modal;
  const { showToast } = useToast();
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(avatarUrl ?? null);
  const [query, setQuery] = useState("");
  const [uploadDirty, setUploadDirty] = useState(false);
  const [uploadDropzoneKey, setUploadDropzoneKey] = useState(0);
  const [uploadState, uploadAction, isUploadPending] = useActionState(
    uploadProfileAvatarAction,
    {
      ok: false,
      message: "",
      avatarUrl: undefined,
    },
  );
  const [selectState, selectAction, isSelectPending] = useActionState(
    selectProfileAvatarAction,
    {
      ok: false,
      message: "",
      avatarUrl: undefined,
    },
  );
  const [removeState, removeAction, isRemovePending] = useActionState(
    removeProfileAvatarAction,
    {
      ok: false,
      message: "",
      avatarUrl: undefined,
    },
  );

  const filteredMedia = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return media;
    }

    return media.filter((item) =>
      [item.originalName, item.mimeType].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [media, query]);

  useEffect(() => {
    if (!uploadState.ok) {
      return;
    }

    showToast(uploadState.message || "Avatar uploaded.");
    queueMicrotask(() => {
      setCurrentAvatarUrl(uploadState.avatarUrl ?? null);
      setUploadDirty(false);
      setUploadDropzoneKey((current) => current + 1);
      closeModal();
    });
  }, [
    closeModal,
    showToast,
    uploadState.avatarUrl,
    uploadState.message,
    uploadState.ok,
  ]);

  useEffect(() => {
    if (!selectState.ok) {
      return;
    }

    showToast(selectState.message || "Avatar selected.");
    queueMicrotask(() => {
      setCurrentAvatarUrl(selectState.avatarUrl ?? null);
      closeModal();
    });
  }, [
    closeModal,
    selectState.avatarUrl,
    selectState.message,
    selectState.ok,
    showToast,
  ]);

  useEffect(() => {
    if (!removeState.ok) {
      return;
    }

    showToast(removeState.message || "Avatar removed.");
    queueMicrotask(() => {
      setCurrentAvatarUrl(null);
    });
  }, [removeState.message, removeState.ok, showToast]);

  return (
    <div className="mb-5">
      <p className="mb-2 text-sm font-medium text-gray-800 dark:text-white/90">
        Avatar
      </p>
      {currentAvatarUrl ? (
        <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white bg-cover bg-center text-lg font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10"
              style={{ backgroundImage: `url(${currentAvatarUrl})` }}
              aria-label="Profile avatar preview"
            />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Profile image set
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Remove this image before choosing a replacement.
              </p>
            </div>
          </div>
          <form action={removeAction}>
            <button
              type="submit"
              disabled={isRemovePending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-error-300 px-4 py-2.5 text-sm font-medium text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-800 dark:hover:bg-error-900/20"
            >
              <TrashBinIcon className="h-4 w-4" />
              {isRemovePending ? "Removing..." : "Remove image"}
            </button>
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-lg font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10">
              {fallback}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                No profile image
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Choose from existing media or upload a new image.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            <PlusIcon className="h-4 w-4" />
            Add image
          </button>
        </div>
      )}
      <ActionStateMessage state={removeState.ok ? undefined : removeState} />

      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        className="relative m-5 w-full max-w-[980px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Select image
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Pick an existing media image or upload a new file to storage.
          </p>
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="min-w-0">
              <div className="mb-4">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search media..."
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
              {filteredMedia.length ? (
                <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredMedia.map((item) => (
                    <form key={item.id} action={selectAction}>
                      <input type="hidden" name="fileAssetId" value={item.id} />
                      <button
                        type="submit"
                        disabled={isSelectPending}
                        className="group w-full overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-theme-xs transition hover:border-brand-300 hover:ring-3 hover:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-white/[0.03]"
                      >
                        <div
                          className="aspect-square bg-gray-100 bg-cover bg-center dark:bg-white/10"
                          style={{ backgroundImage: `url(${item.url})` }}
                          aria-label={`${item.originalName} preview`}
                        />
                        <div className="p-3">
                          <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                            {item.originalName}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {formatBytes(item.sizeBytes)}
                          </p>
                        </div>
                      </button>
                    </form>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
                  No matching images.
                </div>
              )}
              <ActionStateMessage
                state={selectState.ok ? undefined : selectState}
              />
            </div>

            <form action={uploadAction} className="space-y-4">
              <ImageUploadDropzone
                key={uploadDropzoneKey}
                id="profile-avatar-upload"
                name="avatarFile"
                title="Upload new image"
                description="Drag and drop an image here or browse your computer."
                disabled={isUploadPending}
                onFileAccepted={() => setUploadDirty(true)}
              />
              <ActionStateMessage
                state={uploadState.ok ? undefined : uploadState}
              />
              <button
                type="submit"
                disabled={isUploadPending || !uploadDirty}
                className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploadPending ? "Uploading..." : "Upload and use image"}
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function ProfileForm({
  firstName,
  lastName,
  avatarUrl,
  media,
  landline,
  mobile,
  email,
}: {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  media: AvatarMediaItem[];
  landline?: string | null;
  mobile?: string | null;
  email: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(updateProfileAction, {
    ok: false,
    message: "",
  });

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    queueMicrotask(() => {
      setIsDirty(false);
    });
    showToast(state.message || "Profile saved.");
  }, [showToast, state.message, state.ok]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Edit profile
          </h2>
          <LazyHelpTooltip content="Updates the signed-in user's name, contact numbers and profile image used across CRM records and telephony." />
        </div>
        <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Keep the personal details shown in CRM records, telephony and the app
          header up to date.
        </p>
      </div>

      <div className="p-5">
        <ProfileAvatarManager
          avatarUrl={avatarUrl}
          fallback={`${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()}
          media={media}
        />
        <form
          ref={formRef}
          action={formAction}
          onChangeCapture={() => setIsDirty(true)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="profile-first-name">First name</Label>
              <Input
                id="profile-first-name"
                name="firstName"
                defaultValue={firstName}
                required
              />
            </div>
            <div>
              <Label htmlFor="profile-last-name">Last name</Label>
              <Input
                id="profile-last-name"
                name="lastName"
                defaultValue={lastName}
                required
              />
            </div>
            <div>
              <Label htmlFor="profile-mobile">Mobile</Label>
              <Input
                id="profile-mobile"
                name="mobile"
                type="tel"
                defaultValue={mobile ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="profile-landline">Landline</Label>
              <Input
                id="profile-landline"
                name="landline"
                type="tel"
                defaultValue={landline ?? ""}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={email} disabled />
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <ActionStateMessage state={state} />
            <button
              type="submit"
              disabled={isPending || !isDirty}
              className="rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export function PasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    changeOwnPasswordAction,
    {
      ok: false,
      message: "",
    },
  );

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    formRef.current?.reset();
    queueMicrotask(() => {
      setIsDirty(false);
    });
    showToast(state.message || "Password changed.");
  }, [showToast, state.message, state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onChangeCapture={() => setIsDirty(true)}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Change password
          </h2>
          <LazyHelpTooltip content="Lets the signed-in user update their own password after confirming the current password." />
        </div>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Confirm your current password before setting a new one.
        </p>
      </div>

      <div className="p-5">
        <div className="grid gap-4">
          <div>
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              required
            />
          </div>
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              required
            />
          </div>
        </div>
        <div className="mt-4 space-y-4">
          <ActionStateMessage state={state} />
          <button
            type="submit"
            disabled={isPending || !isDirty}
            className="rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Changing..." : "Change password"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function TwoFactorForm({
  enabled,
  enabledAtLabel,
  encryptionReady,
  lastVerifiedAtLabel,
}: {
  enabled: boolean;
  enabledAtLabel?: string | null;
  encryptionReady: boolean;
  lastVerifiedAtLabel?: string | null;
}) {
  const { showToast } = useToast();
  const [currentEnabled, setCurrentEnabled] = useState(enabled);
  const [setupState, setupAction, isSetupPending] = useActionState(
    beginTwoFactorSetupAction,
    {
      ok: false,
      message: "",
    },
  );
  const [enableState, enableAction, isEnablePending] = useActionState(
    enableTwoFactorAction,
    {
      ok: false,
      message: "",
    },
  );
  const [disableState, disableAction, isDisablePending] = useActionState(
    disableTwoFactorAction,
    {
      ok: false,
      message: "",
    },
  );
  const setupReady =
    setupState.ok &&
    setupState.twoFactorSetupSecret &&
    setupState.twoFactorQrCodeDataUrl &&
    !currentEnabled;

  useEffect(() => {
    if (!enableState.ok) {
      return;
    }

    queueMicrotask(() => {
      setCurrentEnabled(true);
    });
    showToast(enableState.message || "Two-factor authentication enabled.");
  }, [enableState.message, enableState.ok, showToast]);

  useEffect(() => {
    if (!disableState.ok) {
      return;
    }

    queueMicrotask(() => {
      setCurrentEnabled(false);
    });
    showToast(disableState.message || "Two-factor authentication disabled.");
  }, [disableState.message, disableState.ok, showToast]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Two-factor authentication
          </h2>
          <LazyHelpTooltip content="Adds an authenticator-app verification code after password sign-in for this account." />
        </div>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Protect your account with a six-digit code from an authenticator app.
        </p>
      </div>

      <div className="space-y-5 p-5">
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            currentEnabled
              ? "border-success-200 bg-success-50 text-success-700 dark:border-success-900/50 dark:bg-success-900/15 dark:text-success-200"
              : "border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/15 dark:text-warning-200"
          }`}
        >
          <p className="font-medium">
            {currentEnabled ? "2FA is enabled" : "2FA is not enabled"}
          </p>
          {currentEnabled ? (
            <p className="mt-1">
              {enabledAtLabel ? `Enabled ${enabledAtLabel}. ` : null}
              {lastVerifiedAtLabel
                ? `Last verified ${lastVerifiedAtLabel}.`
                : "The next sign-in will require a verification code."}
            </p>
          ) : (
            <p className="mt-1">
              Enable 2FA to require an authenticator code after password
              verification.
            </p>
          )}
        </div>

        {!encryptionReady ? (
          <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-900/15 dark:text-error-200">
            Set `CREDENTIAL_ENCRYPTION_KEY` before enabling 2FA. Authenticator
            secrets are encrypted before storage.
          </div>
        ) : null}

        {!currentEnabled ? (
          <>
            <form action={setupAction}>
              <button
                type="submit"
                disabled={isSetupPending || !encryptionReady}
                className="rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSetupPending ? "Preparing..." : "Set up authenticator app"}
              </button>
            </form>
            <ActionStateMessage state={setupState.ok ? undefined : setupState} />

            {setupReady ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="rounded-xl bg-white p-3 ring-1 ring-gray-200 dark:bg-white dark:ring-gray-300">
                    <Image
                      src={setupState.twoFactorQrCodeDataUrl ?? ""}
                      alt="Authenticator app QR code"
                      width={220}
                      height={220}
                      unoptimized
                      className="h-auto w-full"
                    />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        Scan this code in your authenticator app.
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        If scanning fails, enter this setup key manually:
                      </p>
                      <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-800 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-white/90 dark:ring-gray-800">
                        {setupState.twoFactorSetupSecretDisplay}
                      </code>
                    </div>

                    <form action={enableAction} className="grid gap-4">
                      <input
                        type="hidden"
                        name="secret"
                        value={setupState.twoFactorSetupSecret}
                      />
                      <div>
                        <Label htmlFor="two-factor-enable-password">
                          Current password
                        </Label>
                        <Input
                          id="two-factor-enable-password"
                          name="currentPassword"
                          type="password"
                          autoComplete="current-password"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="two-factor-enable-code">
                          Verification code
                        </Label>
                        <Input
                          id="two-factor-enable-code"
                          name="code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]*"
                          maxLength={6}
                          placeholder="123456"
                          required
                        />
                      </div>
                      <ActionStateMessage state={enableState} />
                      <button
                        type="submit"
                        disabled={isEnablePending}
                        className="rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isEnablePending ? "Enabling..." : "Enable 2FA"}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <form action={disableAction} className="grid gap-4">
            <div>
              <Label htmlFor="two-factor-disable-password">
                Current password
              </Label>
              <Input
                id="two-factor-disable-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <div>
              <Label htmlFor="two-factor-disable-code">
                Verification code
              </Label>
              <Input
                id="two-factor-disable-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                required
              />
            </div>
            <ActionStateMessage state={disableState} />
            <button
              type="submit"
              disabled={isDisablePending || !encryptionReady}
              className="inline-flex w-fit items-center justify-center rounded-lg border border-error-300 px-4 py-3 text-sm font-medium text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-800 dark:text-error-300 dark:hover:bg-error-900/20"
            >
              {isDisablePending ? "Disabling..." : "Disable 2FA"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

export function SessionManagementForm({
  sessions,
}: {
  sessions: UserSessionListItem[];
}) {
  const { showToast } = useToast();
  const [revokeState, revokeAction, isRevokePending] = useActionState(
    revokeOwnSessionAction,
    {
      ok: false,
      message: "",
    },
  );
  const [revokeOtherState, revokeOtherAction, isRevokeOtherPending] =
    useActionState(revokeOtherSessionsAction, {
      ok: false,
      message: "",
    });
  const otherSessionCount = sessions.filter((session) => !session.isCurrent)
    .length;

  useEffect(() => {
    if (!revokeState.ok) {
      return;
    }

    showToast(revokeState.message || "Session revoked.");
  }, [revokeState.message, revokeState.ok, showToast]);

  useEffect(() => {
    if (!revokeOtherState.ok) {
      return;
    }

    showToast(revokeOtherState.message || "Other sessions revoked.");
  }, [revokeOtherState.message, revokeOtherState.ok, showToast]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 p-5 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Active sessions
            </h2>
            <LazyHelpTooltip content="Shows active CRM browser sessions for your account and lets you revoke devices you no longer use." />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Review signed-in devices and revoke any session you do not
            recognise.
          </p>
        </div>
        <form action={revokeOtherAction}>
          <button
            type="submit"
            disabled={isRevokeOtherPending || otherSessionCount === 0}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {isRevokeOtherPending
              ? "Revoking..."
              : "Revoke other sessions"}
          </button>
        </form>
      </div>

      <div className="space-y-4 p-5">
        <ActionStateMessage state={revokeState.ok ? undefined : revokeState} />
        <ActionStateMessage
          state={revokeOtherState.ok ? undefined : revokeOtherState}
        />

        {sessions.length ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                        {session.browserLabel}
                      </p>
                      {session.isCurrent ? (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                          Current
                        </span>
                      ) : null}
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
                        {session.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      IP {session.ipAddressLabel}
                    </p>
                  </div>

                  <dl className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-1">
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                        Last seen
                      </dt>
                      <dd className="mt-1 text-gray-800 dark:text-white/90">
                        {session.lastSeenAtLabel}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                        Created
                      </dt>
                      <dd className="mt-1 text-gray-800 dark:text-white/90">
                        {session.createdAtLabel}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                        Expires
                      </dt>
                      <dd className="mt-1 text-gray-800 dark:text-white/90">
                        {session.expiresAtLabel}
                      </dd>
                    </div>
                  </dl>

                  <form action={revokeAction}>
                    <input
                      type="hidden"
                      name="sessionId"
                      value={session.id}
                    />
                    <button
                      type="submit"
                      disabled={isRevokePending || session.isCurrent}
                      className="inline-flex w-full items-center justify-center rounded-lg border border-error-300 px-4 py-2.5 text-sm font-medium text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto dark:border-error-800 dark:text-error-300 dark:hover:bg-error-900/20"
                    >
                      {session.isCurrent ? "Current session" : "Revoke"}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
            No active sessions found.
          </div>
        )}
      </div>
    </section>
  );
}

export function AccountRemovalRequestForm({
  latestRequestLabel,
}: {
  latestRequestLabel?: string | null;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    requestAccountRemovalAction,
    {
      ok: false,
      message: "",
    },
  );

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    queueMicrotask(() => {
      setConfirmed(false);
    });
    showToast(state.message || "Account removal request logged.");
  }, [showToast, state.message, state.ok]);

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-2xl border border-error-200 bg-white shadow-theme-xs dark:border-error-900/60 dark:bg-white/[0.03]"
    >
      <div className="border-b border-error-100 p-5 dark:border-error-900/50">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Account removal
          </h2>
          <LazyHelpTooltip content="Creates an admin review request. The CRM does not instantly delete your account because records, audit history, sales ownership and tasks may need reassignment first." />
        </div>
        <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Request admin review if this CRM login should be removed. Business
          records, audit history and linked activity may be retained or
          reassigned before any account is disabled or anonymised.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {latestRequestLabel ? (
          <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/15 dark:text-warning-200">
            Latest request logged {latestRequestLabel}. Admins can review this
            from Security audit activity.
          </div>
        ) : null}

        <label className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300">
          <input
            type="checkbox"
            name="confirmAccountRemovalRequest"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
          />
          <span>
            I understand this sends an account removal request to an admin and
            does not immediately delete CRM data or linked business records.
          </span>
        </label>

        <ActionStateMessage state={state} />

        <button
          type="submit"
          disabled={isPending || !confirmed}
          className="inline-flex items-center justify-center rounded-lg border border-error-300 px-4 py-3 text-sm font-medium text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-800 dark:text-error-300 dark:hover:bg-error-900/20"
        >
          {isPending ? "Logging request..." : "Request account removal"}
        </button>
      </div>
    </form>
  );
}
