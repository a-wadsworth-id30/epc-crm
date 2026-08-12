import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { runSidekickAssistant } from "@/lib/ai/sidekick";
import {
  authRateLimitContext,
  authRateLimitKey,
  checkAuthRateLimits,
  formatRetryAfter,
  recordAuthRateLimitAttempt,
  type AuthRateLimitRule,
} from "@/lib/auth-rate-limit";
import { parseModuleToggles } from "@/lib/module-toggles";
import { getCrmSettings } from "@/lib/settings";

const sidekickMessageSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(12)
    .optional(),
  pageContext: z
    .object({
      pathname: z.string().max(500).optional(),
      title: z.string().max(160).optional(),
    })
    .optional(),
});

const sidekickUserPolicy = {
  blockMs: 5 * 60 * 1000,
  maxAttempts: 31,
  windowMs: 10 * 60 * 1000,
};

const sidekickIpPolicy = {
  blockMs: 5 * 60 * 1000,
  maxAttempts: 91,
  windowMs: 10 * 60 * 1000,
};

function sidekickRateLimitRules(
  userId: string,
  ipAddress: string,
): AuthRateLimitRule[] {
  return [
    {
      key: authRateLimitKey("sidekick:user", userId),
      policy: sidekickUserPolicy,
    },
    {
      key: authRateLimitKey("sidekick:ip", ipAddress),
      policy: sidekickIpPolicy,
    },
  ];
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: `Sidekick is temporarily rate limited. Try again in ${formatRetryAfter(
        retryAfterSeconds,
      )}.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export async function POST(request: Request) {
  const [user, settings, rateLimitContext] = await Promise.all([
    requireUser(),
    getCrmSettings(),
    authRateLimitContext(),
  ]);
  const moduleToggles = parseModuleToggles(
    settings.moduleToggles,
    settings.companiesEnabled,
  );

  if (!moduleToggles.ai) {
    return NextResponse.json(
      { error: "Sidekick is disabled for this workspace." },
      { status: 403 },
    );
  }

  const rateLimitRules = sidekickRateLimitRules(
    user.id,
    rateLimitContext.ipAddress,
  );
  const limit = await checkAuthRateLimits(rateLimitRules);

  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSeconds);

  const payload = await request.json().catch(() => null);
  const parsed = sidekickMessageSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Ask a shorter Sidekick question with optional recent chat history.",
      },
      { status: 400 },
    );
  }

  const attempt = await recordAuthRateLimitAttempt(rateLimitRules);

  if (attempt.blocked) return rateLimitedResponse(attempt.retryAfterSeconds);

  const result = await runSidekickAssistant(user, parsed.data);

  return NextResponse.json(result);
}
