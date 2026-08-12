import type { Metadata } from "next";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import {
  AccountRemovalRequestFormLoader,
  PasswordFormLoader,
  ProfileFormLoader,
  SessionManagementFormLoader,
  TwoFactorFormLoader,
} from "@/components/crm-boilerplate/ProfileFormLoaders";
import { hasCredentialEncryptionKey } from "@/lib/crypto/secrets";
import { getCurrentSessionId, requireUser } from "@/lib/auth";
import {
  sessionIpLabel,
  sessionStatusForDate,
  sessionUserAgentSummary,
} from "@/lib/auth/session-display";
import { prisma } from "@/lib/prisma";
import { mediaAssetUrl } from "@/lib/storage/media";

export const metadata: Metadata = {
  title: "Profile | iD30 CRM",
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatRelative(value: Date) {
  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatRole(value: string) {
  return value === "ADMIN" ? "Admin" : "User";
}

function AccountOverview({
  activeSessionCount,
  createdAt,
  email,
  role,
  status,
  twoFactorEnabled,
  updatedAt,
  voiceExtension,
}: {
  activeSessionCount: number;
  createdAt: Date;
  email: string;
  role: string;
  status: string;
  twoFactorEnabled: boolean;
  updatedAt: Date;
  voiceExtension: string | null;
}) {
  const accountRows = [
    { label: "Email", value: email },
    { label: "Role", value: formatRole(role) },
    { label: "Status", value: status === "ACTIVE" ? "Active" : "Suspended" },
    {
      label: "Active sessions",
      value: `${activeSessionCount} active ${
        activeSessionCount === 1 ? "session" : "sessions"
      }`,
    },
    {
      label: "Two-factor auth",
      value: twoFactorEnabled ? "Enabled" : "Not enabled",
    },
    { label: "Voice extension", value: voiceExtension ?? "Not assigned" },
    { label: "Account created", value: formatDateTime(createdAt) },
    { label: "Last updated", value: formatDateTime(updatedAt) },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Account overview
          </h2>
          <LazyHelpTooltip content="Shows account access details and current session state for the signed-in user." />
        </div>
        <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Review the identity and access details attached to your CRM login.
        </p>
      </div>

      <dl className="divide-y divide-gray-100 dark:divide-gray-800">
        {accountRows.map((row) => (
          <div
            key={row.label}
            className="grid gap-1 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
          >
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {row.label}
            </dt>
            <dd className="break-words text-sm font-medium text-gray-800 dark:text-white/90 sm:text-right">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function ProfilePage() {
  const user = await requireUser();
  const now = new Date();
  const [
    media,
    accountUser,
    activeSessionCount,
    activeSessions,
    currentSessionId,
    latestRemovalRequest,
  ] =
    await Promise.all([
      prisma.fileAsset.findMany({
        where:
          user.role === "ADMIN"
            ? { mimeType: { startsWith: "image/" } }
            : {
                mimeType: { startsWith: "image/" },
                OR: [
                  { uploadedById: user.id },
                  { entityType: "User", entityId: user.id },
                ],
              },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          createdAt: true,
          email: true,
          role: true,
          status: true,
          twoFactorEnabled: true,
          twoFactorEnabledAt: true,
          twoFactorLastVerifiedAt: true,
          updatedAt: true,
          voiceExtension: true,
        },
      }),
      prisma.session.count({
        where: {
          userId: user.id,
          expiresAt: { gt: now },
        },
      }),
      prisma.session.findMany({
        where: {
          userId: user.id,
          expiresAt: { gt: now },
        },
        orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: {
          createdAt: true,
          expiresAt: true,
          id: true,
          ipAddress: true,
          lastSeenAt: true,
          userAgent: true,
        },
      }),
      getCurrentSessionId(),
      prisma.auditLog.findFirst({
        where: {
          action: "auth.account_removal.requested",
          actorId: user.id,
          entity: "User",
          entityId: user.id,
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);
  const latestRemovalRequestLabel = latestRemovalRequest
    ? formatDateTime(latestRemovalRequest.createdAt)
    : null;
  const twoFactorEnabledAtLabel = accountUser.twoFactorEnabledAt
    ? formatDateTime(accountUser.twoFactorEnabledAt)
    : null;
  const twoFactorLastVerifiedAtLabel = accountUser.twoFactorLastVerifiedAt
    ? formatDateTime(accountUser.twoFactorLastVerifiedAt)
    : null;

  return (
    <>
      <PageHeader
        title="My account"
        description="Manage your profile, access details and password."
      />
      <div className="space-y-6">
        <section>
          <ProfileFormLoader
            firstName={user.firstName ?? user.name.split(" ")[0] ?? ""}
            lastName={user.lastName ?? user.name.split(" ").slice(1).join(" ")}
            avatarUrl={user.avatarUrl}
            media={media.map((item) => ({
              id: item.id,
              originalName: item.originalName,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              createdAt: item.createdAt.toISOString(),
              url: mediaAssetUrl(item.id),
            }))}
            landline={user.landline}
            mobile={user.mobile}
            email={user.email}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <AccountOverview
            activeSessionCount={activeSessionCount}
            createdAt={accountUser.createdAt}
            email={accountUser.email}
            role={accountUser.role}
            status={accountUser.status}
            twoFactorEnabled={accountUser.twoFactorEnabled}
            updatedAt={accountUser.updatedAt}
            voiceExtension={accountUser.voiceExtension}
          />
          <PasswordFormLoader />
        </section>

        <TwoFactorFormLoader
          enabled={accountUser.twoFactorEnabled}
          enabledAtLabel={twoFactorEnabledAtLabel}
          encryptionReady={hasCredentialEncryptionKey()}
          lastVerifiedAtLabel={twoFactorLastVerifiedAtLabel}
        />

        <SessionManagementFormLoader
          sessions={activeSessions.map((session) => ({
            browserLabel: sessionUserAgentSummary(session.userAgent),
            createdAtLabel: formatDateTime(session.createdAt),
            expiresAtLabel: formatDateTime(session.expiresAt),
            id: session.id,
            ipAddressLabel: sessionIpLabel(session.ipAddress),
            isCurrent: session.id === currentSessionId,
            lastSeenAtLabel: `${formatRelative(session.lastSeenAt)} (${formatDateTime(session.lastSeenAt)})`,
            status: sessionStatusForDate(session.expiresAt),
          }))}
        />

        <AccountRemovalRequestFormLoader
          latestRequestLabel={latestRemovalRequestLabel}
        />
      </div>
    </>
  );
}
