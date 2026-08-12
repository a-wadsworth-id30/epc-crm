import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const historyLimit = 100;

function titleCaseStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleCaseDirection(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function contactDisplayName(contact: {
  firstName: string;
  lastName: string;
} | null) {
  if (!contact) {
    return null;
  }

  return `${contact.firstName} ${contact.lastName}`.trim() || null;
}

export async function GET() {
  const user = await requireUser();

  const calls = await prisma.callLog.findMany({
    where: { userId: user.id },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    take: historyLimit,
    select: {
      id: true,
      direction: true,
      status: true,
      fromNumber: true,
      toNumber: true,
      durationSeconds: true,
      startedAt: true,
      contact: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return NextResponse.json({
    calls: calls.map((call) => {
      const isOutbound = call.direction === "OUTBOUND";
      const number = isOutbound
        ? call.toNumber ?? call.fromNumber ?? ""
        : call.fromNumber ?? call.toNumber ?? "";

      return {
        id: call.id,
        direction: titleCaseDirection(call.direction),
        name: contactDisplayName(call.contact) ?? (number || "Unknown number"),
        number: number || "Unknown number",
        status: titleCaseStatus(call.status),
        durationSeconds: call.durationSeconds,
        timestamp: call.startedAt.toISOString(),
      };
    }),
    limit: historyLimit,
  });
}
