import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  desktopSoftphoneDownloadFilename,
  desktopSoftphoneDownloadUrl,
} from "@/lib/desktop-softphone/downloads";

function contentDispositionAttachment(filename: string) {
  return `attachment; filename="${filename.replace(/["\\]/g, "")}"`;
}

function redirectToDownload(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform");
  const url = desktopSoftphoneDownloadUrl(platform);
  const filename = desktopSoftphoneDownloadFilename(platform);

  if (!url) {
    return NextResponse.json(
      { error: "Desktop softphone download URL is not configured." },
      { status: platform === "mac" || platform === "windows" ? 503 : 400 },
    );
  }

  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  if (filename) {
    response.headers.set(
      "Content-Disposition",
      contentDispositionAttachment(filename),
    );
  }

  return response;
}

export async function GET(request: NextRequest) {
  await requireUser();

  return redirectToDownload(request);
}

export async function HEAD(request: NextRequest) {
  await requireUser();

  return redirectToDownload(request);
}
