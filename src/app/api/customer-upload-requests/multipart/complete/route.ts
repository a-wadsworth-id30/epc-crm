import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { completeCustomerUploadMultipartUpload } from "@/lib/customer-upload-multipart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const completeUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        eTag: z.string().trim().min(1),
        partNumber: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(1000),
  token: z.string().trim().min(30).max(160),
  uploadSession: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = completeUploadSchema.safeParse(await request.json());

    if (!parsed.success) {
      return uploadError(
        parsed.error.issues[0]?.message ?? "Check the upload details.",
        400,
      );
    }

    const upload = await completeCustomerUploadMultipartUpload(parsed.data);

    return NextResponse.json({ ok: true, ...upload });
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
  return error instanceof Error ? error.message : "Chunked upload could not finish.";
}
