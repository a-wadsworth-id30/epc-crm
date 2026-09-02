import "server-only";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { usesBrowserSoftphoneRoutingMode } from "@/lib/telephony/softphone-capability";

export type BrowserSoftphoneUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  voiceExtension: string;
  voiceRoutingMode: string;
};

export type BrowserSoftphoneAuthorization =
  | { ok: true; user: BrowserSoftphoneUser }
  | { ok: false; response: NextResponse };

export async function requireBrowserSoftphoneUser(): Promise<BrowserSoftphoneAuthorization> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 },
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      voiceExtension: true,
      voiceRoutingMode: true,
    },
  });

  if (!user || user.status !== "ACTIVE") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This CRM user is not active." },
        { status: 403 },
      ),
    };
  }

  if (!usesBrowserSoftphoneRoutingMode(user.voiceRoutingMode)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Browser softphone is not enabled for this user." },
        { status: 403 },
      ),
    };
  }

  if (!user.voiceExtension?.trim()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This user does not have a browser softphone extension assigned." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      voiceExtension: user.voiceExtension,
      voiceRoutingMode: user.voiceRoutingMode,
    },
  };
}
