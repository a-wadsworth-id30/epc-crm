import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { abortCustomerUploadMultipartUpload } from "@/lib/customer-upload-multipart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const abortUploadSchema = z.object({
  token: z.string().trim().min(30).max(160),
  uploadSession: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = abortUploadSchema.safeParse(await request.json());

    if (!parsed.success) {
      return uploadError(
        parsed.error.issues[0]?.message ?? "Check the upload details.",
        400,
      );
    }

    await abortCustomerUploadMultipartUpload(parsed.data);

    return NextResponse.json({ ok: true });
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
  return error instanceof Error ? error.message : "Chunked upload could not be cancelled.";
}
