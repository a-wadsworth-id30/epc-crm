import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { browserAvailabilityTtlMs } from "@/lib/telephony/twilio-voice";

function canReceiveTransfer(user: {
  mobile: string | null;
  landline: string | null;
  sipAddress: string | null;
  voiceExtension: string | null;
  voiceRoutingMode: string;
  voiceAvailability: string;
}) {
  if (user.voiceAvailability !== "AVAILABLE") {
    return false;
  }

  if (
    (user.voiceRoutingMode === "BROWSER" || user.voiceRoutingMode === "FLEX") &&
    user.voiceExtension
  ) {
    return true;
  }

  if (user.voiceRoutingMode === "SIP") {
    return Boolean(user.sipAddress);
  }

  if (user.voiceRoutingMode === "LANDLINE") {
    return Boolean(user.landline);
  }

  return Boolean(user.mobile || user.landline || user.sipAddress);
}

function canReceiveInternalCall(user: {
  voiceExtension: string | null;
  voiceRoutingMode: string;
  voiceAvailability: string;
}) {
  return (
    user.voiceAvailability === "AVAILABLE" &&
    Boolean(user.voiceExtension) &&
    (user.voiceRoutingMode === "BROWSER" || user.voiceRoutingMode === "FLEX")
  );
}

function effectiveVoiceAvailability(user: {
  voiceAvailability: string;
  voiceLastSeenAt: Date | null;
  voiceRoutingMode: string;
}) {
  const requiresBrowserPresence =
    user.voiceRoutingMode === "BROWSER" || user.voiceRoutingMode === "FLEX";

  if (!requiresBrowserPresence) {
    return user.voiceAvailability;
  }

  if (
    !user.voiceLastSeenAt ||
    Date.now() - user.voiceLastSeenAt.getTime() > browserAvailabilityTtlMs
  ) {
    return "OFFLINE";
  }

  return user.voiceAvailability;
}

export async function GET() {
  await requireUser();

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ firstName: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      email: true,
      mobile: true,
      landline: true,
      voiceRoutingMode: true,
      voiceExtension: true,
      voiceAvailability: true,
      voiceLastSeenAt: true,
      sipAddress: true,
    },
  });

  return NextResponse.json({
    users: users.map((user) => {
      const voiceAvailability = effectiveVoiceAvailability(user);
      const visibleUser = {
        ...user,
        voiceAvailability,
      };

      return {
        ...visibleUser,
        displayName:
          [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name,
        canReceiveTransfer: canReceiveTransfer(visibleUser),
        canReceiveInternalCall: canReceiveInternalCall(visibleUser),
      };
    }),
  });
}
