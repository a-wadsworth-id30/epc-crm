import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildMetadata } from "@/lib/build-metadata";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      {
        status: 401,
        headers: noStoreHeaders,
      },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      build: buildMetadata(),
    },
    {
      headers: noStoreHeaders,
    },
  );
}
