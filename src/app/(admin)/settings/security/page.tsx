import type { Metadata } from "next";
import AuditLogTable from "@/components/crm-boilerplate/AuditLogTable";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import MetricCard from "@/components/crm-boilerplate/MetricCard";
import SectionHeader from "@/components/crm-boilerplate/SectionHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { revokeSessionByAdminAction } from "@/lib/actions/auth";
import { getCurrentSessionId, requireAdmin, sessionCookieName } from "@/lib/auth";
import {
  sessionIpLabel,
  sessionStatusForDate,
  sessionUserAgentSummary,
} from "@/lib/auth/session-display";
import { hasCredentialEncryptionKey } from "@/lib/crypto/secrets";
import {
  mailerSendProvider,
  mailerSendStoredConfigSchema,
} from "@/lib/integrations/mailersend";
import { formatDateTime, formatRelativeDate } from "@/lib/formatters/date";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Security | iD30 CRM",
};

function sessionTtlDays() {
  const days = Number(process.env.SESSION_TTL_DAYS ?? "7");
  return Number.isFinite(days) && days > 0 ? days : 7;
}

function maxActiveSessionsPerUser() {
  const value = Number(process.env.SESSION_MAX_ACTIVE_PER_USER ?? "10");
  return Number.isInteger(value) && value > 0 ? value : 10;
}

export default async function SecuritySettingsPage() {
  const admin = await requireAdmin();
  const now = new Date();
  const passwordPolicy = [
    "Minimum 10 characters",
    "Uppercase and lowercase letters",
    "At least one number",
    "At least one symbol",
    "bcrypt hashing with cost factor 12",
  ];
  const [
    activeSessionCount,
    expiredSessionCount,
    activeUserCount,
    pendingResetCount,
    twoFactorUserCount,
    mailerSendIntegration,
    currentSessionId,
    recentSessions,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.session.count({ where: { expiresAt: { lte: now } } }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.passwordResetToken.count({
      where: {
        expiresAt: { gt: now },
        usedAt: null,
      },
    }),
    prisma.user.count({
      where: { status: "ACTIVE", twoFactorEnabled: true },
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: mailerSendProvider },
      select: { config: true, status: true },
    }),
    getCurrentSessionId(),
    prisma.session.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 12,
      include: {
        user: {
          select: {
            email: true,
            id: true,
            name: true,
            role: true,
            status: true,
          },
        },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        actor: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    }),
  ]);
  const mailerSendConfig = mailerSendStoredConfigSchema.safeParse(
    mailerSendIntegration?.config ?? {},
  );
  const passwordResetEmailReady = Boolean(
    mailerSendConfig.success &&
      mailerSendConfig.data.credentials?.apiToken &&
      mailerSendConfig.data.fromEmail,
  );

  return (
    <>
      <PageHeader
        title="Security"
        description="Authentication posture, session visibility and operational audit activity."
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Active sessions"
            value={activeSessionCount.toString()}
            detail={`${expiredSessionCount} expired records retained`}
            labelVariant="uppercase"
          />
          <MetricCard
            label="Active users"
            value={activeUserCount.toString()}
            detail={`Signed in as ${admin.email}`}
            labelVariant="uppercase"
          />
          <MetricCard
            label="Pending resets"
            value={pendingResetCount.toString()}
            detail="Unused reset tokens still inside their expiry window"
            labelVariant="uppercase"
          />
          <MetricCard
            label="2FA users"
            value={`${twoFactorUserCount}/${activeUserCount}`}
            detail="Active users protected by authenticator app verification"
            labelVariant="uppercase"
            muted={twoFactorUserCount === 0}
          />
          <MetricCard
            label="Secret encryption"
            value={hasCredentialEncryptionKey() ? "Ready" : "Needed"}
            detail="CREDENTIAL_ENCRYPTION_KEY validation"
            labelVariant="uppercase"
            muted={!hasCredentialEncryptionKey()}
          />
        </div>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Security posture"
            description="Current server-side controls used by the CRM."
            help="Summarises implemented authentication, password, session and credential protection controls."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Authentication controls
              </h3>
              <dl className="mt-4 space-y-3">
                <PolicyRow label="Session storage" value="Database-backed HTTP-only cookies" status="Ready" />
                <PolicyRow label="Cookie name" value={sessionCookieName} status="Ready" />
                <PolicyRow label="Session lifetime" value={`${sessionTtlDays()} days`} status="Ready" />
                <PolicyRow
                  label="Session cap"
                  value={`${maxActiveSessionsPerUser()} active sessions per user`}
                  status="Ready"
                />
                <PolicyRow
                  label="Sign-in throttling"
                  value="Email/IP and IP attempt windows"
                  status="Ready"
                />
                <PolicyRow
                  label="Two-factor authentication"
                  value="Authenticator-app verification enforced after password sign-in for enabled users"
                  status={twoFactorUserCount > 0 ? "Ready" : "Available"}
                />
                <PolicyRow
                  label="Reset throttling"
                  value="Password reset request and token attempt windows"
                  status="Ready"
                />
                <PolicyRow
                  label="Secure cookies"
                  value={process.env.NODE_ENV === "production" ? "Enabled in production" : "Enabled when NODE_ENV=production"}
                  status={process.env.NODE_ENV === "production" ? "Ready" : "Planned"}
                />
                <PolicyRow
                  label="Password reset email"
                  value={
                    passwordResetEmailReady
                      ? `MailerSend sender ${mailerSendConfig.success ? mailerSendConfig.data.fromEmail : ""}`
                      : "Connect MailerSend API token and sender email"
                  }
                  status={passwordResetEmailReady ? "Ready" : "Needed"}
                />
                <PolicyRow
                  label="Reset token expiry"
                  value="One-hour hashed reset tokens"
                  status="Ready"
                />
                <PolicyRow label="Public signup" value="Disabled; admins create users" status="Ready" />
              </dl>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Password policy
              </h3>
              <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                {passwordPolicy.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div
                className={`mt-5 rounded-lg border p-3 text-sm ${
                  passwordResetEmailReady
                    ? "border-success-200 bg-success-50 text-success-800 dark:border-success-900/40 dark:bg-success-900/15 dark:text-success-300"
                    : "border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/15 dark:text-warning-300"
                }`}
              >
                Password reset requests create hashed one-hour tokens, send
                MailerSend reset links, enforce the CRM password policy and
                revoke active sessions after completion.
                {!passwordResetEmailReady
                  ? " MailerSend still needs an API token and sender email before users can receive reset links."
                  : null}
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Recent sessions"
            description="Latest CRM browser sessions ordered by last activity."
            help="Uses server-side session records so admins can see who is currently authenticated, when sessions expire and which browser/IP was recorded."
          />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.02]">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last seen</th>
                  <th className="px-5 py-3">Expires</th>
                  <th className="px-5 py-3">Browser</th>
                  <th className="px-5 py-3">IP</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentSessions.map((session) => (
                  <tr key={session.id} className="text-sm text-gray-700 dark:text-gray-300">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-800 dark:text-white/90">
                        {session.user.name}
                        {session.user.id === admin.id ? (
                          <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                            You
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {session.user.email} · {session.user.role.toLowerCase()}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge>{sessionStatusForDate(session.expiresAt)}</StatusBadge>
                    </td>
                    <td className="px-5 py-4">
                      <div>{formatRelativeDate(session.lastSeenAt)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(session.lastSeenAt)}
                      </div>
                    </td>
                    <td className="px-5 py-4">{formatDateTime(session.expiresAt)}</td>
                    <td className="max-w-[260px] px-5 py-4">
                      <div className="truncate" title={session.userAgent ?? undefined}>
                        {sessionUserAgentSummary(session.userAgent)}
                      </div>
                    </td>
                    <td className="px-5 py-4">{sessionIpLabel(session.ipAddress)}</td>
                    <td className="px-5 py-4">
                      {session.id === currentSessionId ? (
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          Current
                        </span>
                      ) : (
                        <form action={revokeSessionByAdminAction}>
                          <input
                            type="hidden"
                            name="sessionId"
                            value={session.id}
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-error-300 px-3 py-2 text-xs font-medium text-error-600 transition hover:bg-error-50 dark:border-error-800 dark:text-error-300 dark:hover:bg-error-900/20"
                          >
                            Revoke
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
                {!recentSessions.length ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                      No session records found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Recent audit events"
            description="Latest operational audit records captured by server-side workflows."
            help="AuditLog records AI assistant access, password reset activity and other server-side security events as they are added."
          />
          <AuditLogTable events={recentAuditLogs} />
        </section>
      </div>
    </>
  );
}

function PolicyRow({
  label,
  status,
  value,
}: {
  label: string;
  status: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <dt className="text-sm font-medium text-gray-800 dark:text-white/90">
          {label}
        </dt>
        <dd className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {value}
        </dd>
      </div>
      <StatusBadge>{status}</StatusBadge>
    </div>
  );
}
