"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

type AvatarMediaItem = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
};

type UserSessionListItem = {
  browserLabel: string;
  createdAtLabel: string;
  expiresAtLabel: string;
  id: string;
  ipAddressLabel: string;
  isCurrent: boolean;
  lastSeenAtLabel: string;
  status: string;
};

type ProfileFormProps = {
  avatarUrl?: string | null;
  email: string;
  firstName: string;
  landline?: string | null;
  lastName: string;
  media: AvatarMediaItem[];
  mobile?: string | null;
};

type TwoFactorFormProps = {
  enabled: boolean;
  enabledAtLabel?: string | null;
  encryptionReady: boolean;
  lastVerifiedAtLabel?: string | null;
};

type SessionManagementFormProps = {
  sessions: UserSessionListItem[];
};

type AccountRemovalRequestFormProps = {
  latestRequestLabel?: string | null;
};

const ProfileForm = dynamic(
  () =>
    import("@/components/crm-boilerplate/ProfileForms").then(
      (module) => module.ProfileForm,
    ),
  {
    ssr: false,
    loading: () => <ProfileSectionSkeleton title="Edit profile" />,
  },
) as ComponentType<ProfileFormProps>;

const PasswordForm = dynamic(
  () =>
    import("@/components/crm-boilerplate/ProfileForms").then(
      (module) => module.PasswordForm,
    ),
  {
    ssr: false,
    loading: () => <ProfileSectionSkeleton title="Change password" compact />,
  },
) as ComponentType;

const TwoFactorForm = dynamic(
  () =>
    import("@/components/crm-boilerplate/ProfileForms").then(
      (module) => module.TwoFactorForm,
    ),
  {
    ssr: false,
    loading: () => (
      <ProfileSectionSkeleton title="Two-factor authentication" />
    ),
  },
) as ComponentType<TwoFactorFormProps>;

const SessionManagementForm = dynamic(
  () =>
    import("@/components/crm-boilerplate/ProfileForms").then(
      (module) => module.SessionManagementForm,
    ),
  {
    ssr: false,
    loading: () => <ProfileSectionSkeleton title="Active sessions" />,
  },
) as ComponentType<SessionManagementFormProps>;

const AccountRemovalRequestForm = dynamic(
  () =>
    import("@/components/crm-boilerplate/ProfileForms").then(
      (module) => module.AccountRemovalRequestForm,
    ),
  {
    ssr: false,
    loading: () => <ProfileSectionSkeleton title="Account removal" compact />,
  },
) as ComponentType<AccountRemovalRequestFormProps>;

export function ProfileFormLoader(props: ProfileFormProps) {
  return <ProfileForm {...props} />;
}

export function PasswordFormLoader() {
  return <PasswordForm />;
}

export function TwoFactorFormLoader(props: TwoFactorFormProps) {
  return <TwoFactorForm {...props} />;
}

export function SessionManagementFormLoader(
  props: SessionManagementFormProps,
) {
  return <SessionManagementForm {...props} />;
}

export function AccountRemovalRequestFormLoader(
  props: AccountRemovalRequestFormProps,
) {
  return <AccountRemovalRequestForm {...props} />;
}

function ProfileSectionSkeleton({
  compact = false,
  title,
}: {
  compact?: boolean;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="h-5 w-48 max-w-full rounded-full bg-gray-100 dark:bg-white/[0.06]" />
        <span className="sr-only">{title}</span>
        <div className="mt-3 h-4 w-full max-w-md rounded-full bg-gray-100 dark:bg-white/[0.06]" />
      </div>
      <div className="space-y-4 p-5">
        <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
        {!compact ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
              <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
            </div>
            <div className="h-10 w-36 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
          </>
        ) : null}
      </div>
    </section>
  );
}
