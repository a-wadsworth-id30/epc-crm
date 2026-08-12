import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";

export function unauthorizedApiResponse(message = "Authentication is required.") {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    { status: 401 },
  );
}

export async function requireApiUser(): Promise<
  | {
      ok: true;
      user: CurrentUser;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      response: unauthorizedApiResponse(),
    };
  }

  return { ok: true, user };
}
