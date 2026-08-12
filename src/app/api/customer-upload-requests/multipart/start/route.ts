import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startCustomerUploadMultipartUpload } from "@/lib/customer-upload-multipart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startUploadSchema = z.object({
  deferRequestCompletion: z.boolean().optional(),
  fileName: z.string().trim().min(1),
  fileSize: z.number().int().positive(),
  itemId: z.string().trim().min(1),
  mimeType: z.string().trim().optional().default("application/octet-stream"),
  notes: z.string().nullable().optional(),
  tagsText: z.string().nullable().optional(),
  token: z.string().trim().min(30).max(160),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = startUploadSchema.safeParse(await request.json());

    if (!parsed.success) {
      return uploadError(
        parsed.error.issues[0]?.message ?? "Check the upload details.",
        400,
      );
    }

    const upload = await startCustomerUploadMultipartUpload(parsed.data);

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
  return error instanceof Error ? error.message : "Chunked upload could not start.";
}
