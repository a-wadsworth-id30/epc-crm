import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { removeCustomerUploadedFile } from "@/lib/customer-upload-file-removal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const removeUploadedFileSchema = z.object({
  fileAssetId: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
  token: z.string().trim().min(1).max(160),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = removeUploadedFileSchema.safeParse(await request.json());

    if (!parsed.success) {
      return uploadError(
        parsed.error.issues[0]?.message ?? "Check the file details.",
        400,
      );
    }

    const result = await removeCustomerUploadedFile(parsed.data);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return uploadError(uploadErrorMessage(error), 400);
  }
}

function uploadError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, message },
    {
      headers: { "Cache-Control": "no-store" },
      status,
    },
  );
}

function uploadErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Uploaded file could not be removed.";
}
