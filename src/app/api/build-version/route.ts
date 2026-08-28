import { NextResponse } from "next/server";
import { publicBuildMetadata } from "@/lib/build-metadata";

export const dynamic = "force-static";
export const revalidate = 30;

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      build: publicBuildMetadata(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30",
      },
    },
  );
}
