import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBrowserSoftphoneUser } from "@/lib/telephony/authorization";

type DesktopSoftphoneCommandPayload = {
  phone?: unknown;
  contactName?: unknown;
  contextName?: unknown;
  opportunityId?: unknown;
  contactId?: unknown;
};

type DesktopSoftphoneCommand = {
  id: string;
  type: "dial";
  createdAt: string;
  payload: {
    phone: string;
    contactName?: string;
    contextName?: string;
    opportunityId?: string;
    contactId?: string;
  };
};

const commandTtlMs = 120_000;

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isDesktopSoftphoneCommand(
  value: Prisma.JsonValue | null | undefined,
): value is DesktopSoftphoneCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const command = value as Record<string, unknown>;
  const payload = command.payload;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const commandPayload = payload as Record<string, unknown>;

  return (
    command.type === "dial" &&
    typeof command.id === "string" &&
    typeof command.createdAt === "string" &&
    typeof commandPayload.phone === "string"
  );
}

function commandIsFresh(command: DesktopSoftphoneCommand) {
  const createdAt = Date.parse(command.createdAt);

  return Number.isFinite(createdAt) && Date.now() - createdAt <= commandTtlMs;
}

export async function GET() {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const user = await prisma.user.findUnique({
    where: { id: authorization.user.id },
    select: { desktopSoftphoneCommand: true },
  });
  const command = isDesktopSoftphoneCommand(user?.desktopSoftphoneCommand)
    ? user.desktopSoftphoneCommand
    : null;

  if (!command || !commandIsFresh(command)) {
    if (user?.desktopSoftphoneCommand) {
      await prisma.user.update({
        where: { id: authorization.user.id },
        data: { desktopSoftphoneCommand: Prisma.JsonNull },
      });
    }

    return NextResponse.json({ command: null });
  }

  await prisma.user.update({
    where: { id: authorization.user.id },
    data: { desktopSoftphoneCommand: Prisma.JsonNull },
  });

  return NextResponse.json({ command });
}

export async function POST(request: Request) {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    type?: unknown;
    payload?: DesktopSoftphoneCommandPayload;
  };
  const phone = optionalString(body.payload?.phone);

  if (body.type !== "dial" || !phone) {
    return NextResponse.json(
      { error: "A dial command requires a phone number." },
      { status: 400 },
    );
  }

  const command: DesktopSoftphoneCommand = {
    id: randomUUID(),
    type: "dial",
    createdAt: new Date().toISOString(),
    payload: {
      phone,
      contactName: optionalString(body.payload?.contactName),
      contextName: optionalString(body.payload?.contextName),
      opportunityId: optionalString(body.payload?.opportunityId),
      contactId: optionalString(body.payload?.contactId),
    },
  };

  await prisma.user.update({
    where: { id: authorization.user.id },
    data: {
      desktopSoftphoneCommand: JSON.parse(
        JSON.stringify(command),
      ) as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true, commandId: command.id });
}
