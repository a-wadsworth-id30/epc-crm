import "server-only";

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const passwordResetTokenTtlMs = 60 * 60 * 1000;

export type PasswordResetTokenStatus =
  | {
      valid: true;
      email: string;
      expiresAt: Date;
    }
  | {
      valid: false;
      message: string;
    };

export function createPasswordResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getPasswordResetTokenStatus(
  token: string | null | undefined,
): Promise<PasswordResetTokenStatus> {
  const cleanToken = token?.trim();

  if (!cleanToken || cleanToken.length < 20) {
    return {
      valid: false,
      message: "This reset link is invalid. Request a new password reset link.",
    };
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(cleanToken) },
    include: {
      user: {
        select: {
          email: true,
          status: true,
        },
      },
    },
  });

  if (!resetToken || resetToken.usedAt) {
    return {
      valid: false,
      message: "This reset link is invalid. Request a new password reset link.",
    };
  }

  if (resetToken.expiresAt <= new Date()) {
    return {
      valid: false,
      message: "This reset link has expired. Request a new password reset link.",
    };
  }

  if (resetToken.user.status !== "ACTIVE") {
    return {
      valid: false,
      message: "This account is not active. Contact an administrator.",
    };
  }

  return {
    valid: true,
    email: resetToken.user.email,
    expiresAt: resetToken.expiresAt,
  };
}
