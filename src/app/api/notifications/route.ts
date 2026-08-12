import { NextResponse } from "next/server";
import { requireApiUser, unauthorizedApiResponse } from "@/lib/api-auth";
import {
  dismissHeaderNotification,
  loadHeaderNotifications,
  markAllHeaderNotificationsReviewed,
  markHeaderNotificationReviewed,
} from "@/lib/notifications";

export async function GET() {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return unauthorizedApiResponse();
  }

  const notifications = await loadHeaderNotifications(auth.user.id);

  return NextResponse.json({ notifications });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return unauthorizedApiResponse();
  }

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    notificationId?: string;
  } | null;

  if (body?.action === "mark-all-reviewed") {
    const notifications = await markAllHeaderNotificationsReviewed(auth.user.id);

    return NextResponse.json({ notifications });
  }

  if (
    (body?.action === "mark-reviewed" || body?.action === "dismiss") &&
    typeof body.notificationId === "string" &&
    body.notificationId.trim()
  ) {
    const notifications =
      body.action === "dismiss"
        ? await dismissHeaderNotification(auth.user.id, body.notificationId)
        : await markHeaderNotificationReviewed(auth.user.id, body.notificationId);

    return NextResponse.json({ notifications });
  }

  return NextResponse.json(
    { message: "Unsupported notification action." },
    { status: 400 },
  );
}
