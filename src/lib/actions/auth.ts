"use server";

import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSession,
  destroyCurrentSession,
  getCurrentSessionId,
  requireAdmin,
  requireUser,
} from "@/lib/auth";
import {
  authRateLimitContext,
  authRateLimitKey,
  checkAuthRateLimits,
  formatRetryAfter,
  recordAuthRateLimitAttempt,
  resetAuthRateLimits,
  type AuthRateLimitRule,
} from "@/lib/auth-rate-limit";
import {
  createTwoFactorChallengeToken,
  formatTwoFactorSecret,
  generateTwoFactorSecret,
  twoFactorOtpAuthUrl,
  verifyTwoFactorChallengeToken,
  verifyTwoFactorCode,
} from "@/lib/auth/two-factor";
import {
  decryptSecret,
  encryptSecret,
  hasCredentialEncryptionKey,
} from "@/lib/crypto/secrets";
import {
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/password";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetTokenTtlMs,
} from "@/lib/password-reset";
import {
  parseInterfaceDefaults,
  safeInterfaceLandingPath,
} from "@/lib/interface-defaults";
import { revalidateHeaderNotifications } from "@/lib/notifications";
import { parseCompanyProfile } from "@/lib/company-profile";
import { trustedAppBaseUrl } from "@/lib/http/origin";
import { sendMailerSendEmail } from "@/lib/integrations/mailersend";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";
import { mediaAssetUrl, uploadMediaFile } from "@/lib/storage/media";
import { isPrismaDatabaseUnavailableError } from "@/lib/prisma-errors";
import {
  bulkUserImportMaxFileBytes,
  bulkUserImportMaxRows,
  parseBulkUserImportCsv,
  type BulkUserImportCandidate,
  type BulkUserImportIssue,
} from "@/lib/users/bulk-user-import";
import {
  defaultRoleTemplateForRole,
  getUserRoleTemplate,
  userRoleTemplateSchema,
  type UserRoleTemplateKey,
} from "@/lib/users/role-templates";
import { parseCreateUserFormData } from "@/lib/users/create-user-form";

type ActionState = {
  ok: boolean;
  message: string;
  avatarUrl?: string | null;
  redirectTo?: string;
  twoFactorEnabled?: boolean;
  twoFactorRequired?: boolean;
  twoFactorSetupSecret?: string;
  twoFactorSetupSecretDisplay?: string;
  twoFactorToken?: string;
  twoFactorQrCodeDataUrl?: string;
  twoFactorUserEmail?: string;
};

export type AvatarActionState = {
  ok: boolean;
  message: string;
  avatarUrl?: string | null;
};

export type BulkUserImportPreviewRow = {
  email: string;
  firstName: string;
  landline: string | null;
  lastName: string;
  message: string;
  mobile: string | null;
  name: string;
  role: "ADMIN" | "USER";
  roleTemplate: UserRoleTemplateKey | null;
  rowNumber: number;
  status: "CREATE" | "ERROR" | "SKIP";
};

export type BulkUserImportState = {
  adminCount?: number;
  createdCount?: number;
  emailFailedCount?: number;
  emailSentCount?: number;
  errors?: number;
  importPayload?: string;
  ok: boolean;
  readyCount?: number;
  rows?: BulkUserImportPreviewRow[];
  skipped?: number;
  totalRows?: number;
  message: string;
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});
const twoFactorLoginSchema = z.object({
  code: z.string().trim().min(6),
  next: z.string().optional(),
  token: z.string().trim().min(20),
});

const passwordResetRequestSchema = z.object({
  email: z.string().trim().email(),
});

const passwordResetConfirmSchema = z
  .object({
    token: z.string().trim().min(20),
    newPassword: z.string().min(1),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const bulkUserImportPayloadSchema = z.array(
  z.object({
    email: z.string().trim().email(),
    firstName: z.string().trim().min(1),
    landline: z.string().trim().nullable().optional(),
    lastName: z.string().trim().min(1),
    mobile: z.string().trim().nullable().optional(),
    name: z.string().trim().min(2),
    role: z.enum(["ADMIN", "USER"]),
    roleTemplate: userRoleTemplateSchema,
    rowNumber: z.number().int().positive(),
  }),
);

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  landline: z.string().trim().optional(),
  mobile: z.string().trim().optional(),
});
const accountRemovalRequestSchema = z.object({
  confirmAccountRemovalRequest: z.coerce
    .string()
    .refine((value) => value === "on", {
      message: "Confirm that you understand this creates an admin request.",
    }),
});
const enableTwoFactorSchema = z.object({
  code: z.string().trim().min(6, "Enter the six-digit code."),
  currentPassword: z.string().min(1, "Enter your current password."),
  secret: z.string().trim().min(16, "Start setup again to generate a secret."),
});
const disableTwoFactorSchema = z.object({
  code: z.string().trim().min(6, "Enter the six-digit code."),
  currentPassword: z.string().min(1, "Enter your current password."),
});
const sessionActionSchema = z.object({
  sessionId: z.string().trim().min(1, "Session is required."),
});

const passwordResetRequestedMessage =
  "If an active CRM account exists for that email address, a password reset link will be sent shortly.";
const loginEmailPolicy = {
  blockMs: 15 * 60 * 1000,
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
};
const loginIpPolicy = {
  blockMs: 15 * 60 * 1000,
  maxAttempts: 30,
  windowMs: 15 * 60 * 1000,
};
const passwordResetEmailPolicy = {
  blockMs: 30 * 60 * 1000,
  maxAttempts: 5,
  windowMs: 30 * 60 * 1000,
};
const passwordResetIpPolicy = {
  blockMs: 30 * 60 * 1000,
  maxAttempts: 20,
  windowMs: 30 * 60 * 1000,
};
const passwordResetConfirmPolicy = {
  blockMs: 15 * 60 * 1000,
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000,
};
const twoFactorLoginPolicy = {
  blockMs: 15 * 60 * 1000,
  maxAttempts: 8,
  windowMs: 15 * 60 * 1000,
};
const twoFactorLoginIpPolicy = {
  blockMs: 15 * 60 * 1000,
  maxAttempts: 40,
  windowMs: 15 * 60 * 1000,
};

async function nextVoiceExtension() {
  const [extension] = await nextVoiceExtensions(1);

  if (!extension) {
    throw new Error("No available voice extensions.");
  }

  return extension;
}

async function nextVoiceExtensions(count: number) {
  const existingExtensions = await prisma.user.findMany({
    select: { voiceExtension: true },
  });
  const usedExtensions = new Set(
    existingExtensions
      .map((user) => user.voiceExtension?.trim())
      .filter(Boolean),
  );

  const extensions: string[] = [];

  for (let extension = 1001; extension <= 9999; extension += 1) {
    const candidate = String(extension);

    if (!usedExtensions.has(candidate)) {
      extensions.push(candidate);

      if (extensions.length === count) {
        return extensions;
      }
    }
  }

  throw new Error("No available voice extensions.");
}

function safeLoginRedirect(next: string | undefined, fallback: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  if (next.startsWith("/api/") || next.startsWith("/auth/")) {
    return fallback;
  }

  return next;
}

function jsonForPrisma(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function identifierHash(value: string) {
  return authRateLimitKey("audit", value).split(":")[1];
}

function loginRateLimitRules(email: string, ipAddress: string): AuthRateLimitRule[] {
  return [
    {
      key: authRateLimitKey("login:email-ip", `${email}|${ipAddress}`),
      policy: loginEmailPolicy,
    },
    {
      key: authRateLimitKey("login:ip", ipAddress),
      policy: loginIpPolicy,
    },
  ];
}

function passwordResetRateLimitRules(
  email: string,
  ipAddress: string,
): AuthRateLimitRule[] {
  return [
    {
      key: authRateLimitKey("password-reset:email-ip", `${email}|${ipAddress}`),
      policy: passwordResetEmailPolicy,
    },
    {
      key: authRateLimitKey("password-reset:ip", ipAddress),
      policy: passwordResetIpPolicy,
    },
  ];
}

function passwordResetConfirmRateLimitRules(
  token: string,
  ipAddress: string,
): AuthRateLimitRule[] {
  return [
    {
      key: authRateLimitKey("password-reset-confirm:token-ip", `${token}|${ipAddress}`),
      policy: passwordResetConfirmPolicy,
    },
    {
      key: authRateLimitKey("password-reset-confirm:ip", ipAddress),
      policy: passwordResetIpPolicy,
    },
  ];
}

function twoFactorLoginRateLimitRules(
  userId: string,
  ipAddress: string,
): AuthRateLimitRule[] {
  return [
    {
      key: authRateLimitKey("login:2fa:user-ip", `${userId}|${ipAddress}`),
      policy: twoFactorLoginPolicy,
    },
    {
      key: authRateLimitKey("login:2fa:ip", ipAddress),
      policy: twoFactorLoginIpPolicy,
    },
  ];
}

async function auditAuthSecurityEvent({
  action,
  metadata,
  userId,
}: {
  action: string;
  metadata?: Record<string, unknown>;
  userId?: string | null;
}) {
  await prisma.auditLog
    .create({
      data: {
        actorId: userId ?? null,
        action,
        entity: "Auth",
        entityId: userId ?? null,
        metadata: jsonForPrisma(metadata),
      },
    })
    .catch((error) => {
      console.error("Auth audit log failed", error);
    });
}

async function auditPasswordResetRequest({
  action,
  userId,
  metadata,
}: {
  action: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog
    .create({
      data: {
        actorId: userId ?? null,
        action,
        entity: "PasswordResetToken",
        entityId: userId ?? null,
        metadata: jsonForPrisma(metadata),
      },
    })
    .catch((error) => {
      console.error("Password reset audit log failed", error);
    });
}

async function sendPasswordResetEmail({
  email,
  name,
  purpose = "reset",
  token,
}: {
  email: string;
  name: string;
  purpose?: "reset" | "setup";
  token: string;
}) {
  const settings = await getCrmSettings();
  const companyProfile = parseCompanyProfile(settings.companyProfile);
  const appName =
    companyProfile.organizationName ||
    process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
    "iD30 CRM";
  const baseUrl = trustedAppBaseUrl();
  const resetUrl = new URL("/reset-password/confirm", baseUrl);
  resetUrl.searchParams.set("token", token);

  const isSetup = purpose === "setup";

  await sendMailerSendEmail({
    to: { email, name },
    subject: isSetup
      ? `Set up your ${appName} password`
      : `Reset your ${appName} password`,
    text: [
      isSetup
        ? `An account has been created for you in ${appName}.`
        : `A password reset was requested for your ${appName} account.`,
      "",
      "Use the link below to choose your password. This link expires in 60 minutes.",
      "",
      resetUrl.toString(),
      "",
      isSetup
        ? "If you were not expecting this account, contact your CRM administrator."
        : "If you did not request this, you can ignore this email.",
    ].join("\n"),
    tags: [isSetup ? "password-setup" : "password-reset"],
  });
}

async function crmApplicationName() {
  const settings = await getCrmSettings();
  const companyProfile = parseCompanyProfile(settings.companyProfile);

  return (
    companyProfile.organizationName ||
    process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
    "iD30 CRM"
  );
}

async function fallbackLandingPath() {
  const settings = await getCrmSettings();
  const interfaceDefaults = parseInterfaceDefaults(settings.interfaceDefaults);

  return safeInterfaceLandingPath(interfaceDefaults.defaultLandingPage);
}

async function completeTwoFactorLoginAction(
  formData: FormData,
): Promise<ActionState> {
  const parsed = twoFactorLoginSchema.safeParse({
    code: formData.get("twoFactorCode"),
    next: formData.get("next") || undefined,
    token: formData.get("twoFactorToken"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter the verification code.",
      twoFactorRequired: true,
      twoFactorToken: String(formData.get("twoFactorToken") ?? ""),
    };
  }

  let challenge: { userId: string } | null = null;

  try {
    challenge = verifyTwoFactorChallengeToken(parsed.data.token);
  } catch (error) {
    console.error("Two-factor challenge validation failed", error);
  }

  if (!challenge) {
    return {
      ok: false,
      message: "This verification session has expired. Sign in again.",
    };
  }

  const requestContext = await authRateLimitContext();
  const rateLimitRules = twoFactorLoginRateLimitRules(
    challenge.userId,
    requestContext.ipAddress,
  );
  const limit = await checkAuthRateLimits(rateLimitRules);

  if (!limit.ok) {
    await auditAuthSecurityEvent({
      action: "auth.login.two_factor_rate_limited",
      metadata: {
        ipAddress: requestContext.ipAddress,
        retryAfterSeconds: limit.retryAfterSeconds,
        userAgent: requestContext.userAgent,
      },
      userId: challenge.userId,
    });

    return {
      ok: false,
      message: `Too many verification attempts. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
      twoFactorRequired: true,
      twoFactorToken: parsed.data.token,
    };
  }

  let user;

  try {
    user = await prisma.user.findUnique({
      where: { id: challenge.userId },
      select: {
        email: true,
        id: true,
        status: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });
  } catch (error) {
    if (!isPrismaDatabaseUnavailableError(error)) {
      throw error;
    }

    console.error("Two-factor login failed before user validation", error);
    return {
      ok: false,
      message:
        "The CRM database is unavailable. Add DATABASE_URL in Netlify before signing in.",
    };
  }

  if (
    !user ||
    user.status !== "ACTIVE" ||
    !user.twoFactorEnabled ||
    !user.twoFactorSecret
  ) {
    await recordAuthRateLimitAttempt(rateLimitRules);
    return {
      ok: false,
      message: "Verification could not be completed. Sign in again.",
    };
  }

  let secret: string;

  try {
    secret = decryptSecret(user.twoFactorSecret);
  } catch (error) {
    console.error("Unable to decrypt two-factor secret", error);
    await auditAuthSecurityEvent({
      action: "auth.login.two_factor_secret_unavailable",
      metadata: {
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
      },
      userId: user.id,
    });

    return {
      ok: false,
      message:
        "Two-factor authentication is unavailable. Contact an administrator.",
    };
  }

  if (!verifyTwoFactorCode(secret, parsed.data.code)) {
    const attempt = await recordAuthRateLimitAttempt(rateLimitRules);

    if (attempt.blocked) {
      await auditAuthSecurityEvent({
        action: "auth.login.two_factor_rate_limited",
        metadata: {
          ipAddress: requestContext.ipAddress,
          retryAfterSeconds: attempt.retryAfterSeconds,
          userAgent: requestContext.userAgent,
        },
        userId: user.id,
      });
    }

    return {
      ok: false,
      message: "Invalid verification code.",
      twoFactorRequired: true,
      twoFactorToken: parsed.data.token,
      twoFactorUserEmail: user.email,
    };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorLastVerifiedAt: new Date() },
    });
    await createSession(user.id);
  } catch (error) {
    console.error("Login failed while creating two-factor session", error);
    return {
      ok: false,
      message: "Sign in could not be completed. Please try again.",
    };
  }

  await resetAuthRateLimits([
    ...rateLimitRules,
    ...loginRateLimitRules(user.email, requestContext.ipAddress),
  ]);

  const fallbackPath = await fallbackLandingPath();
  return {
    ok: true,
    message: "Signed in. Redirecting...",
    redirectTo: safeLoginRedirect(parsed.data.next, fallbackPath),
  };
}

export async function loginAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formData.get("twoFactorToken")) {
    return completeTwoFactorLoginAction(formData);
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: "Enter a valid email address and password." };
  }

  const email = parsed.data.email.toLowerCase();
  const requestContext = await authRateLimitContext();
  const rateLimitRules = loginRateLimitRules(email, requestContext.ipAddress);
  const limit = await checkAuthRateLimits(rateLimitRules);

  if (!limit.ok) {
    await auditAuthSecurityEvent({
      action: "auth.login.rate_limited",
      metadata: {
        attemptedEmailHash: identifierHash(email),
        ipAddress: requestContext.ipAddress,
        retryAfterSeconds: limit.retryAfterSeconds,
        userAgent: requestContext.userAgent,
      },
    });

    return {
      ok: false,
      message: `Too many sign-in attempts. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
    };
  }

  let user;

  try {
    user = await prisma.user.findUnique({
      where: { email },
    });
  } catch (error) {
    console.error("Login failed before credential validation", error);
    return {
      ok: false,
      message:
        "The CRM database is unavailable. Add DATABASE_URL in Netlify before signing in.",
    };
  }

  if (!user || user.status !== "ACTIVE") {
    const attempt = await recordAuthRateLimitAttempt(rateLimitRules);

    if (attempt.blocked) {
      await auditAuthSecurityEvent({
        action: "auth.login.rate_limited",
        metadata: {
          attemptedEmailHash: identifierHash(email),
          ipAddress: requestContext.ipAddress,
          retryAfterSeconds: attempt.retryAfterSeconds,
          userAgent: requestContext.userAgent,
        },
      });
    }

    return { ok: false, message: "Invalid login details." };
  }

  const validPassword = await verifyPassword(
    parsed.data.password,
    user.passwordHash,
  );

  if (!validPassword) {
    const attempt = await recordAuthRateLimitAttempt(rateLimitRules);

    if (attempt.blocked) {
      await auditAuthSecurityEvent({
        action: "auth.login.rate_limited",
        metadata: {
          attemptedEmailHash: identifierHash(email),
          ipAddress: requestContext.ipAddress,
          retryAfterSeconds: attempt.retryAfterSeconds,
          userAgent: requestContext.userAgent,
        },
        userId: user.id,
      });
    }

    return { ok: false, message: "Invalid login details." };
  }

  if (user.twoFactorEnabled) {
    if (!user.twoFactorSecret) {
      await auditAuthSecurityEvent({
        action: "auth.login.two_factor_secret_missing",
        metadata: {
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent,
        },
        userId: user.id,
      });

      return {
        ok: false,
        message:
          "Two-factor authentication is not configured correctly. Contact an administrator.",
      };
    }

    try {
      const token = createTwoFactorChallengeToken(user.id);
      await auditAuthSecurityEvent({
        action: "auth.login.two_factor_required",
        metadata: {
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent,
        },
        userId: user.id,
      });

      return {
        ok: false,
        message: "Enter the verification code from your authenticator app.",
        twoFactorRequired: true,
        twoFactorToken: token,
        twoFactorUserEmail: user.email,
      };
    } catch (error) {
      console.error("Unable to create two-factor challenge", error);
      await auditAuthSecurityEvent({
        action: "auth.login.two_factor_unavailable",
        metadata: {
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent,
        },
        userId: user.id,
      });

      return {
        ok: false,
        message:
          "Two-factor authentication is unavailable. Contact an administrator.",
      };
    }
  }

  try {
    await createSession(user.id);
  } catch (error) {
    console.error("Login failed while creating session", error);
    return {
      ok: false,
      message: "Sign in could not be completed. Please try again.",
    };
  }

  await resetAuthRateLimits(rateLimitRules.slice(0, 1));

  const fallbackPath = await fallbackLandingPath();

  return {
    ok: true,
    message: "Signed in. Redirecting...",
    redirectTo: safeLoginRedirect(parsed.data.next, fallbackPath),
  };
}

export async function requestPasswordResetAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const email = parsed.data.email.toLowerCase();
  const requestContext = await authRateLimitContext();
  const rateLimitRules = passwordResetRateLimitRules(
    email,
    requestContext.ipAddress,
  );
  const limit = await checkAuthRateLimits(rateLimitRules);

  if (!limit.ok) {
    await auditAuthSecurityEvent({
      action: "auth.password_reset.rate_limited",
      metadata: {
        attemptedEmailHash: identifierHash(email),
        ipAddress: requestContext.ipAddress,
        retryAfterSeconds: limit.retryAfterSeconds,
        userAgent: requestContext.userAgent,
      },
    });

    return { ok: true, message: passwordResetRequestedMessage };
  }

  await recordAuthRateLimitAttempt(rateLimitRules);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, status: true },
    });

    if (user?.status === "ACTIVE") {
      const token = createPasswordResetToken();

      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        }),
        prisma.passwordResetToken.create({
          data: {
            tokenHash: hashPasswordResetToken(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + passwordResetTokenTtlMs),
          },
        }),
      ]);

      try {
        await sendPasswordResetEmail({
          email: user.email,
          name: user.name,
          token,
        });
        await auditPasswordResetRequest({
          action: "auth.password_reset.requested",
          userId: user.id,
          metadata: { email: user.email },
        });
      } catch (error) {
        console.error("Password reset email failed", error);
        await auditPasswordResetRequest({
          action: "auth.password_reset.email_failed",
          userId: user.id,
          metadata: {
            email: user.email,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }
  } catch (error) {
    console.error("Password reset request failed", error);
  }

  return { ok: true, message: passwordResetRequestedMessage };
}

export async function resetPasswordWithTokenAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = passwordResetConfirmSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Enter and confirm your new password.",
    };
  }

  const passwordErrors = validatePasswordPolicy(parsed.data.newPassword);
  if (passwordErrors.length) {
    return { ok: false, message: passwordErrors[0] };
  }

  const tokenHash = hashPasswordResetToken(parsed.data.token);
  const now = new Date();
  const requestContext = await authRateLimitContext();
  const rateLimitRules = passwordResetConfirmRateLimitRules(
    tokenHash,
    requestContext.ipAddress,
  );
  const limit = await checkAuthRateLimits(rateLimitRules);

  if (!limit.ok) {
    await auditAuthSecurityEvent({
      action: "auth.password_reset_confirm.rate_limited",
      metadata: {
        ipAddress: requestContext.ipAddress,
        retryAfterSeconds: limit.retryAfterSeconds,
        tokenHash: identifierHash(tokenHash),
        userAgent: requestContext.userAgent,
      },
    });

    return {
      ok: false,
      message: `Too many reset attempts. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
    };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              status: true,
            },
          },
        },
      });

      if (
        !resetToken ||
        resetToken.usedAt ||
        resetToken.expiresAt <= now ||
        resetToken.user.status !== "ACTIVE"
      ) {
        return null;
      }

      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        return null;
      }

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
        },
        data: { usedAt: now },
      });

      await tx.session.deleteMany({
        where: { userId: resetToken.userId },
      });

      return {
        userId: resetToken.userId,
        email: resetToken.user.email,
      };
    });

    if (!result) {
      const attempt = await recordAuthRateLimitAttempt(rateLimitRules);

      if (attempt.blocked) {
        await auditAuthSecurityEvent({
          action: "auth.password_reset_confirm.rate_limited",
          metadata: {
            ipAddress: requestContext.ipAddress,
            retryAfterSeconds: attempt.retryAfterSeconds,
            tokenHash: identifierHash(tokenHash),
            userAgent: requestContext.userAgent,
          },
        });
      }

      return {
        ok: false,
        message:
          "This reset link is invalid or has expired. Request a new password reset link.",
      };
    }

    await auditPasswordResetRequest({
      action: "auth.password_reset.completed",
      userId: result.userId,
      metadata: { email: result.email, sessionsRevoked: true },
    });
    await resetAuthRateLimits(rateLimitRules.slice(0, 1));

    return {
      ok: true,
      message: "Password reset. You can now sign in with your new password.",
    };
  } catch (error) {
    console.error("Password reset completion failed", error);
    return {
      ok: false,
      message: "Password reset could not be completed. Please try again.",
    };
  }
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/signin");
}

export async function revokeOwnSessionAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = sessionActionSchema.safeParse({
    sessionId: formData.get("sessionId"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Choose a valid session to revoke." };
  }

  const currentSessionId = await getCurrentSessionId();

  if (!currentSessionId) {
    return { ok: false, message: "Current session could not be verified." };
  }

  if (parsed.data.sessionId === currentSessionId) {
    return {
      ok: false,
      message: "Use Sign out to end your current session.",
    };
  }

  const session = await prisma.session.findFirst({
    where: {
      id: parsed.data.sessionId,
      userId: user.id,
    },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
    },
  });

  if (!session) {
    return { ok: false, message: "Session was already removed." };
  }

  await prisma.$transaction([
    prisma.session.deleteMany({
      where: {
        id: session.id,
        userId: user.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "auth.session.revoked",
        actorId: user.id,
        entity: "Session",
        entityId: session.id,
        metadata: jsonForPrisma({
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
        }),
      },
    }),
  ]);

  revalidatePath("/profile");
  revalidatePath("/settings/security");

  return { ok: true, message: "Session revoked." };
}

export async function revokeOtherSessionsAction(
  previousState: ActionState,
): Promise<ActionState> {
  void previousState;
  const user = await requireUser();
  const currentSessionId = await getCurrentSessionId();

  if (!currentSessionId) {
    return { ok: false, message: "Current session could not be verified." };
  }

  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: { gt: new Date() },
      id: { not: currentSessionId },
      userId: user.id,
    },
  });

  if (result.count > 0) {
    await prisma.auditLog.create({
      data: {
        action: "auth.session.revoked_other",
        actorId: user.id,
        entity: "Session",
        entityId: user.id,
        metadata: jsonForPrisma({ revokedCount: result.count }),
      },
    });
  }

  revalidatePath("/profile");
  revalidatePath("/settings/security");

  return {
    ok: true,
    message:
      result.count === 1
        ? "1 other session revoked."
        : `${result.count} other sessions revoked.`,
  };
}

export async function revokeSessionByAdminAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = sessionActionSchema.safeParse({
    sessionId: formData.get("sessionId"),
  });

  if (!parsed.success) {
    return;
  }

  const currentSessionId = await getCurrentSessionId();

  if (parsed.data.sessionId === currentSessionId) {
    return;
  }

  const session = await prisma.session.findUnique({
    where: { id: parsed.data.sessionId },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      user: {
        select: {
          email: true,
          id: true,
          name: true,
        },
      },
      userId: true,
    },
  });

  if (!session) {
    return;
  }

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { id: session.id } }),
    prisma.auditLog.create({
      data: {
        action: "auth.session.revoked_by_admin",
        actorId: admin.id,
        entity: "Session",
        entityId: session.id,
        metadata: jsonForPrisma({
          ipAddress: session.ipAddress,
          targetUserEmail: session.user.email,
          targetUserId: session.userId,
          targetUserName: session.user.name,
          userAgent: session.userAgent,
        }),
      },
    }),
  ]);

  revalidatePath("/profile");
  revalidatePath("/settings/security");
}

export async function updateProfileAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    landline: formData.get("landline"),
    mobile: formData.get("mobile"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid profile details.",
    };
  }

  const firstName = parsed.data.firstName;
  const lastName = parsed.data.lastName;
  const avatarFile = formData.get("avatarFile");
  let avatarUrl = user.avatarUrl;

  if (avatarFile instanceof File && avatarFile.size > 0) {
    try {
      const fileAsset = await uploadMediaFile({
        file: avatarFile,
        folder: `avatars/users/${user.id}`,
        entityType: "User",
        entityId: user.id,
        uploadedById: user.id,
        maxUploadMb: 5,
        requireImage: true,
      });

      avatarUrl = mediaAssetUrl(fileAsset.id);
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Avatar upload failed.",
      };
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      avatarUrl,
      landline: parsed.data.landline || null,
      mobile: parsed.data.mobile || null,
    },
  });
  revalidatePath("/profile");
  revalidatePath("/", "layout");

  return { ok: true, message: "Profile updated.", avatarUrl };
}

export async function uploadProfileAvatarAction(
  _: AvatarActionState,
  formData: FormData,
): Promise<AvatarActionState> {
  const user = await requireUser();
  const avatarFile = formData.get("avatarFile");

  if (!(avatarFile instanceof File) || avatarFile.size === 0) {
    return { ok: false, message: "Choose an image to upload." };
  }

  try {
    const fileAsset = await uploadMediaFile({
      file: avatarFile,
      folder: `avatars/users/${user.id}`,
      entityType: "User",
      entityId: user.id,
      uploadedById: user.id,
      maxUploadMb: 5,
      requireImage: true,
    });
    const avatarUrl = mediaAssetUrl(fileAsset.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
    });

    revalidatePath("/profile");
    revalidatePath("/", "layout");

    return { ok: true, message: "Avatar uploaded.", avatarUrl };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Avatar upload failed.",
    };
  }
}

export async function selectProfileAvatarAction(
  _: AvatarActionState,
  formData: FormData,
): Promise<AvatarActionState> {
  const user = await requireUser();
  const fileAssetId = String(formData.get("fileAssetId") ?? "");

  if (!fileAssetId) {
    return { ok: false, message: "Choose an image." };
  }

  const fileAsset = await prisma.fileAsset.findUnique({
    where: { id: fileAssetId },
  });

  if (!fileAsset || !fileAsset.mimeType.startsWith("image/")) {
    return { ok: false, message: "Choose a valid image." };
  }

  if (
    user.role !== "ADMIN" &&
    fileAsset.uploadedById !== user.id &&
    !(fileAsset.entityType === "User" && fileAsset.entityId === user.id)
  ) {
    return { ok: false, message: "You cannot use that image." };
  }

  const avatarUrl = mediaAssetUrl(fileAsset.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl },
  });

  revalidatePath("/profile");
  revalidatePath("/", "layout");

  return { ok: true, message: "Avatar selected.", avatarUrl };
}

export async function removeProfileAvatarAction(
  previousState: AvatarActionState,
): Promise<AvatarActionState> {
  void previousState;
  const user = await requireUser();

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: null },
  });

  revalidatePath("/profile");
  revalidatePath("/", "layout");

  return { ok: true, message: "Avatar removed.", avatarUrl: null };
}

export async function changeOwnPasswordAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  const passwordErrors = validatePasswordPolicy(newPassword);
  if (passwordErrors.length) {
    return { ok: false, message: passwordErrors[0] };
  }

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
  });
  const validCurrentPassword = await verifyPassword(
    currentPassword,
    dbUser.passwordHash,
  );

  if (!validCurrentPassword) {
    return { ok: false, message: "Current password is incorrect." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return { ok: true, message: "Password changed." };
}

export async function beginTwoFactorSetupAction(
  previousState: ActionState,
): Promise<ActionState> {
  void previousState;
  const user = await requireUser();

  if (!hasCredentialEncryptionKey()) {
    return {
      ok: false,
      message:
        "Two-factor setup needs CREDENTIAL_ENCRYPTION_KEY to encrypt the authenticator secret.",
    };
  }

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true, twoFactorEnabled: true },
  });

  if (dbUser.twoFactorEnabled) {
    return {
      ok: false,
      message: "Two-factor authentication is already enabled.",
      twoFactorEnabled: true,
    };
  }

  const issuer = await crmApplicationName();
  const secret = generateTwoFactorSecret();
  const otpAuthUrl = twoFactorOtpAuthUrl({
    email: dbUser.email,
    issuer,
    secret,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });

  await auditAuthSecurityEvent({
    action: "auth.two_factor.setup_started",
    metadata: { email: dbUser.email },
    userId: user.id,
  });

  return {
    ok: true,
    message: "Scan the QR code, then confirm the first code from your app.",
    twoFactorEnabled: false,
    twoFactorQrCodeDataUrl: qrCodeDataUrl,
    twoFactorSetupSecret: secret,
    twoFactorSetupSecretDisplay: formatTwoFactorSecret(secret),
  };
}

export async function enableTwoFactorAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = enableTwoFactorSchema.safeParse({
    code: formData.get("code"),
    currentPassword: formData.get("currentPassword"),
    secret: formData.get("secret"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Enter your password and verification code.",
    };
  }

  if (!hasCredentialEncryptionKey()) {
    return {
      ok: false,
      message:
        "Two-factor setup needs CREDENTIAL_ENCRYPTION_KEY to encrypt the authenticator secret.",
    };
  }

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      passwordHash: true,
      twoFactorEnabled: true,
    },
  });

  if (dbUser.twoFactorEnabled) {
    return {
      ok: true,
      message: "Two-factor authentication is already enabled.",
      twoFactorEnabled: true,
    };
  }

  const validCurrentPassword = await verifyPassword(
    parsed.data.currentPassword,
    dbUser.passwordHash,
  );

  if (!validCurrentPassword) {
    return { ok: false, message: "Current password is incorrect." };
  }

  if (!verifyTwoFactorCode(parsed.data.secret, parsed.data.code)) {
    return { ok: false, message: "Invalid verification code." };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: now,
        twoFactorLastVerifiedAt: now,
        twoFactorSecret: encryptSecret(parsed.data.secret),
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "auth.two_factor.enabled",
        actorId: user.id,
        entity: "User",
        entityId: user.id,
        metadata: jsonForPrisma({ email: user.email }),
      },
    }),
  ]);

  revalidatePath("/profile");
  revalidatePath("/settings/security");

  return {
    ok: true,
    message: "Two-factor authentication enabled.",
    twoFactorEnabled: true,
  };
}

export async function disableTwoFactorAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = disableTwoFactorSchema.safeParse({
    code: formData.get("code"),
    currentPassword: formData.get("currentPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Enter your password and verification code.",
    };
  }

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      passwordHash: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
    },
  });

  if (!dbUser.twoFactorEnabled || !dbUser.twoFactorSecret) {
    return {
      ok: true,
      message: "Two-factor authentication is already disabled.",
      twoFactorEnabled: false,
    };
  }

  const validCurrentPassword = await verifyPassword(
    parsed.data.currentPassword,
    dbUser.passwordHash,
  );

  if (!validCurrentPassword) {
    return { ok: false, message: "Current password is incorrect." };
  }

  let secret: string;

  try {
    secret = decryptSecret(dbUser.twoFactorSecret);
  } catch (error) {
    console.error("Unable to decrypt two-factor secret for disable", error);
    return {
      ok: false,
      message:
        "Two-factor authentication cannot be disabled because the secret cannot be decrypted.",
    };
  }

  if (!verifyTwoFactorCode(secret, parsed.data.code)) {
    return { ok: false, message: "Invalid verification code." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorEnabledAt: null,
        twoFactorLastVerifiedAt: null,
        twoFactorSecret: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "auth.two_factor.disabled",
        actorId: user.id,
        entity: "User",
        entityId: user.id,
        metadata: jsonForPrisma({ email: user.email }),
      },
    }),
  ]);

  revalidatePath("/profile");
  revalidatePath("/settings/security");

  return {
    ok: true,
    message: "Two-factor authentication disabled.",
    twoFactorEnabled: false,
  };
}

export async function requestAccountRemovalAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = accountRemovalRequestSchema.safeParse({
    confirmAccountRemovalRequest: formData.get("confirmAccountRemovalRequest"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Confirm that you understand this creates an admin request.",
    };
  }

  const existingRequest = await prisma.auditLog.findFirst({
    where: {
      action: "auth.account_removal.requested",
      actorId: user.id,
      entity: "User",
      entityId: user.id,
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (existingRequest) {
    return {
      ok: true,
      message:
        "Your account removal request is already logged for admin review.",
    };
  }

  await prisma.auditLog.create({
    data: {
      action: "auth.account_removal.requested",
      actorId: user.id,
      entity: "User",
      entityId: user.id,
      metadata: jsonForPrisma({
        email: user.email,
        name: user.name,
        requestedAt: new Date().toISOString(),
        role: user.role,
      }),
    },
  });

  revalidatePath("/profile");
  revalidatePath("/settings/security");
  revalidateHeaderNotifications();

  return {
    ok: true,
    message:
      "Account removal request logged. An admin can now review it safely.",
  };
}

function issueToPreviewRow(issue: BulkUserImportIssue): BulkUserImportPreviewRow {
  const firstName = issue.firstName ?? "";
  const lastName = issue.lastName ?? "";
  const role = issue.role === "ADMIN" ? "ADMIN" : "USER";

  return {
    email: issue.email ?? "",
    firstName,
    landline: null,
    lastName,
    message: issue.reason,
    mobile: null,
    name: `${firstName} ${lastName}`.trim(),
    role,
    roleTemplate: null,
    rowNumber: issue.rowNumber,
    status: "ERROR",
  };
}

function candidateToPreviewRow(
  candidate: BulkUserImportCandidate,
  existingEmails: Set<string>,
): BulkUserImportPreviewRow {
  const exists = existingEmails.has(candidate.email);

  return {
    email: candidate.email,
    firstName: candidate.firstName,
    landline: candidate.landline,
    lastName: candidate.lastName,
    message: exists ? "User already exists in this CRM." : "Ready to import.",
    mobile: candidate.mobile,
    name: candidate.name,
    role: candidate.role,
    roleTemplate: candidate.roleTemplate,
    rowNumber: candidate.rowNumber,
    status: exists ? "SKIP" : "CREATE",
  };
}

function bulkImportStateMessage({
  readyCount,
  skipped,
  errors,
}: {
  errors: number;
  readyCount: number;
  skipped: number;
}) {
  if (readyCount > 0) {
    return `${readyCount} user${readyCount === 1 ? "" : "s"} ready to import. ${skipped} skipped, ${errors} with errors.`;
  }

  return `No users are ready to import. ${skipped} skipped, ${errors} with errors.`;
}

export async function previewBulkUserImportAction(
  _: BulkUserImportState,
  formData: FormData,
): Promise<BulkUserImportState> {
  await requireAdmin();
  const file = formData.get("userCsv");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Upload a CSV file to preview." };
  }

  if (file.size > bulkUserImportMaxFileBytes) {
    return {
      ok: false,
      message: "CSV file is too large. The limit is 1 MB.",
    };
  }

  const parsed = parseBulkUserImportCsv(await file.text());
  const candidateEmails = parsed.candidates.map((candidate) => candidate.email);
  const existingUsers = candidateEmails.length
    ? await prisma.user.findMany({
        where: { email: { in: candidateEmails } },
        select: { email: true },
      })
    : [];
  const existingEmails = new Set(
    existingUsers.map((user) => user.email.toLowerCase()),
  );
  const rows = [
    ...parsed.candidates.map((candidate) =>
      candidateToPreviewRow(candidate, existingEmails),
    ),
    ...parsed.issues.map(issueToPreviewRow),
  ].sort((left, right) => left.rowNumber - right.rowNumber);
  const readyRows = rows.filter((row) => row.status === "CREATE");
  const skipped = rows.filter((row) => row.status === "SKIP").length;
  const errors = rows.filter((row) => row.status === "ERROR").length;
  const adminCount = readyRows.filter((row) => row.role === "ADMIN").length;

  return {
    adminCount,
    errors,
    importPayload: readyRows.length
      ? JSON.stringify(
          readyRows.map((row) => ({
            email: row.email,
            firstName: row.firstName,
            landline: row.landline,
            lastName: row.lastName,
            mobile: row.mobile,
            name: row.name,
            role: row.role,
            roleTemplate:
              row.roleTemplate ?? defaultRoleTemplateForRole(row.role),
            rowNumber: row.rowNumber,
          })),
        )
      : undefined,
    ok: true,
    readyCount: readyRows.length,
    rows,
    skipped,
    totalRows: parsed.totalRows,
    message: bulkImportStateMessage({
      errors,
      readyCount: readyRows.length,
      skipped,
    }),
  };
}

export async function importBulkUsersAction(
  _: BulkUserImportState,
  formData: FormData,
): Promise<BulkUserImportState> {
  const admin = await requireAdmin();
  const confirmAdminImport = formData.get("confirmAdminImport") === "on";
  const sendSetupEmails = formData.get("sendSetupEmails") === "on";
  const rawPayload = String(formData.get("importPayload") ?? "");
  let payload: unknown;

  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return { ok: false, message: "Preview the CSV again before importing." };
  }

  const parsed = bulkUserImportPayloadSchema.safeParse(payload);

  if (!parsed.success || parsed.data.length === 0) {
    return { ok: false, message: "No valid users were selected for import." };
  }

  if (parsed.data.length > bulkUserImportMaxRows) {
    return {
      ok: false,
      message: `You can import up to ${bulkUserImportMaxRows} users at once.`,
    };
  }

  const normalizedRows = parsed.data.map((row) => ({
    ...row,
    email: row.email.toLowerCase(),
    landline: row.landline?.trim() || null,
    mobile: row.mobile?.trim() || null,
    name: `${row.firstName.trim()} ${row.lastName.trim()}`.trim(),
  }));
  const duplicateEmails = new Set<string>();
  const seenEmails = new Set<string>();
  const uniqueRows = normalizedRows.filter((row) => {
    if (seenEmails.has(row.email)) {
      duplicateEmails.add(row.email);
      return false;
    }

    seenEmails.add(row.email);
    return true;
  });
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: uniqueRows.map((row) => row.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(
    existingUsers.map((user) => user.email.toLowerCase()),
  );
  const rowsToCreate = uniqueRows.filter(
    (row) => !existingEmails.has(row.email),
  );
  const adminCreateCount = rowsToCreate.filter((row) => row.role === "ADMIN")
    .length;

  if (!rowsToCreate.length) {
    return {
      ok: false,
      message: "No users were created. All selected emails already exist.",
      skipped: existingEmails.size + duplicateEmails.size,
    };
  }

  if (adminCreateCount > 0 && !confirmAdminImport) {
    return {
      adminCount: adminCreateCount,
      ok: false,
      message: `Confirm that you want to create ${adminCreateCount} admin account${adminCreateCount === 1 ? "" : "s"} before importing.`,
    };
  }

  let voiceExtensions: string[];

  try {
    voiceExtensions = await nextVoiceExtensions(rowsToCreate.length);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "No available voice extensions."
    ) {
      return { ok: false, message: "No available voice extensions." };
    }

    throw error;
  }

  const setupEmails: Array<{ email: string; name: string; token: string; userId: string }> =
    [];

  await prisma.$transaction(async (tx) => {
    for (const [index, row] of rowsToCreate.entries()) {
      const setupToken = createPasswordResetToken();
      const user = await tx.user.create({
        data: {
          email: row.email,
          firstName: row.firstName,
          landline: row.landline,
          lastName: row.lastName,
          mobile: row.mobile,
          name: row.name,
          passwordHash: await hashPassword(createPasswordResetToken()),
          role: row.role,
          roleTemplate: row.roleTemplate,
          status: "ACTIVE",
          voiceExtension: voiceExtensions[index],
        },
        select: { email: true, id: true, name: true },
      });

      await tx.passwordResetToken.create({
        data: {
          expiresAt: new Date(Date.now() + passwordResetTokenTtlMs),
          tokenHash: hashPasswordResetToken(setupToken),
          userId: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "auth.user.bulk_imported",
          actorId: admin.id,
          entity: "User",
          entityId: user.id,
          metadata: jsonForPrisma({
            email: user.email,
            role: row.role,
            roleTemplate: row.roleTemplate,
            rowNumber: row.rowNumber,
          }),
        },
      });

      setupEmails.push({
        email: user.email,
        name: user.name,
        token: setupToken,
        userId: user.id,
      });
    }

    await tx.auditLog.create({
      data: {
        action: "auth.users.bulk_imported",
        actorId: admin.id,
        entity: "User",
        entityId: admin.id,
        metadata: jsonForPrisma({
          createdCount: rowsToCreate.length,
          adminCount: adminCreateCount,
          duplicateCount: duplicateEmails.size,
          existingCount: existingEmails.size,
          sendSetupEmails,
        }),
      },
    });
  });

  let emailSentCount = 0;
  let emailFailedCount = 0;

  if (sendSetupEmails) {
    for (const setupEmail of setupEmails) {
      try {
        await sendPasswordResetEmail({
          email: setupEmail.email,
          name: setupEmail.name,
          purpose: "setup",
          token: setupEmail.token,
        });
        emailSentCount += 1;
        await auditPasswordResetRequest({
          action: "auth.password_setup.sent",
          userId: setupEmail.userId,
          metadata: { email: setupEmail.email },
        });
      } catch (error) {
        emailFailedCount += 1;
        console.error("Bulk user setup email failed", error);
        await auditPasswordResetRequest({
          action: "auth.password_setup.email_failed",
          userId: setupEmail.userId,
          metadata: {
            email: setupEmail.email,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }
  }

  revalidatePath("/settings/users");
  revalidatePath("/settings/security");
  revalidatePath("/telephony");
  revalidatePath("/telephony/users");

  return {
    adminCount: adminCreateCount,
    createdCount: rowsToCreate.length,
    emailFailedCount,
    emailSentCount,
    ok: true,
    skipped: existingEmails.size + duplicateEmails.size,
    message: sendSetupEmails
      ? `${rowsToCreate.length} user${rowsToCreate.length === 1 ? "" : "s"} imported. ${emailSentCount} setup email${emailSentCount === 1 ? "" : "s"} sent, ${emailFailedCount} failed.`
      : `${rowsToCreate.length} user${rowsToCreate.length === 1 ? "" : "s"} imported. Setup emails were not sent.`,
  };
}

export async function createUserAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = parseCreateUserFormData(formData);

  if (!parsed.success) {
    return { ok: false, message: "Enter a name, email, role template and password." };
  }

  const passwordErrors = validatePasswordPolicy(parsed.data.password);
  if (passwordErrors.length) {
    return { ok: false, message: passwordErrors.join(" ") };
  }

  try {
    const [firstName, ...lastNameParts] = parsed.data.name.trim().split(/\s+/);
    const voiceExtension = await nextVoiceExtension();
    const template = parsed.data.roleTemplate
      ? getUserRoleTemplate(parsed.data.roleTemplate)
      : null;
    const role = template?.baseRole ?? parsed.data.role ?? "USER";
    const roleTemplate = template?.key ?? defaultRoleTemplateForRole(role);

    await prisma.user.create({
      data: {
        name: parsed.data.name,
        firstName,
        lastName: lastNameParts.join(" ") || null,
        email: parsed.data.email,
        role,
        roleTemplate,
        passwordHash: await hashPassword(parsed.data.password),
        voiceExtension,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "No available voice extensions."
    ) {
      return { ok: false, message: "No available voice extensions." };
    }

    return { ok: false, message: "A user with that email already exists." };
  }

  revalidatePath("/settings/users");
  revalidatePath("/telephony");
  revalidatePath("/telephony/users");
  return { ok: true, message: "User created." };
}

export async function updateUserRoleAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!["ADMIN", "USER"].includes(role)) return;
  if (userId === admin.id && role !== "ADMIN") return;

  await prisma.user.update({
    where: { id: userId },
    data: { role: role as "ADMIN" | "USER" },
  });

  revalidatePath("/settings/users");
  revalidatePath("/telephony");
}

export async function updateUserRoleTemplateAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const roleTemplateKey = String(formData.get("roleTemplate") ?? "");
  const template = getUserRoleTemplate(roleTemplateKey);

  if (!userId || !template) return;
  if (userId === admin.id && template.baseRole !== "ADMIN") return;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        role: template.baseRole,
        roleTemplate: template.key,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "auth.user.role_template_updated",
        actorId: admin.id,
        entity: "User",
        entityId: userId,
        metadata: jsonForPrisma({
          baseRole: template.baseRole,
          roleTemplate: template.key,
        }),
      },
    }),
  ]);

  revalidatePath("/settings/users");
  revalidatePath("/settings/security");
  revalidatePath("/settings/setup");
  revalidatePath("/telephony");
}

export async function sendUserSetupLinkAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return { ok: false, message: "Choose a user to send a setup link." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, id: true, name: true, status: true },
  });

  if (!user || user.status !== "ACTIVE") {
    return {
      ok: false,
      message: "Setup links can only be sent to active users.",
    };
  }

  const token = createPasswordResetToken();

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    }),
    prisma.passwordResetToken.create({
      data: {
        expiresAt: new Date(Date.now() + passwordResetTokenTtlMs),
        tokenHash: hashPasswordResetToken(token),
        userId: user.id,
      },
    }),
  ]);

  try {
    await sendPasswordResetEmail({
      email: user.email,
      name: user.name,
      purpose: "setup",
      token,
    });
    await auditPasswordResetRequest({
      action: "auth.password_setup.sent",
      userId: user.id,
      metadata: {
        email: user.email,
        requestedByAdminId: admin.id,
      },
    });
  } catch (error) {
    console.error("User setup email failed", error);
    await auditPasswordResetRequest({
      action: "auth.password_setup.email_failed",
      userId: user.id,
      metadata: {
        email: user.email,
        error: error instanceof Error ? error.message : "Unknown error",
        requestedByAdminId: admin.id,
      },
    });

    revalidatePath("/settings/users");
    revalidatePath("/settings/setup");

    return {
      ok: false,
      message:
        "Setup link was created, but the email could not be sent. Check MailerSend settings.",
    };
  }

  revalidatePath("/settings/users");
  revalidatePath("/settings/security");
  revalidatePath("/settings/setup");

  return { ok: true, message: `Setup link sent to ${user.email}.` };
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId || userId === admin.id) return;

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/settings/users");
  revalidatePath("/telephony");
}
