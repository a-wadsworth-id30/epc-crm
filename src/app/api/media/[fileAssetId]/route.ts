import { FileAssetVisibility } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeFileAssetAccess } from "@/lib/storage/authorization";
import { createR2DownloadUrl } from "@/lib/storage/r2";

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileAssetId: string }> },
) {
  const { fileAssetId } = await context.params;
  const fileAsset = await prisma.fileAsset.findUnique({
    where: { id: fileAssetId },
  });

  if (!fileAsset) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  if (fileAsset.visibility === FileAssetVisibility.PRIVATE) {
    const user = await getCurrentUser();
    const access = await authorizeFileAssetAccess(fileAsset, user);

    if (!access.ok) {
      return NextResponse.json(
        { message: access.message },
        { status: access.status },
      );
    }
  }

  const url = await createR2DownloadUrl({
    key: fileAsset.key,
    expiresIn: 300,
  });

  return NextResponse.redirect(url, {
    headers: {
      "Cache-Control": "private, max-age=240",
    },
  });
}
