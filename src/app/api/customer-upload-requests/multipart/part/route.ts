import { NextRequest, NextResponse } from "next/server";
import { customerUploadMultipartPartSizeBytes } from "@/lib/customer-upload-multipart-config";
import { uploadCustomerUploadMultipartPart } from "@/lib/customer-upload-multipart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("x-id30-upload-token")?.trim();
    const uploadSession = request.headers.get("x-id30-upload-session")?.trim();
    const partNumber = Number(
      request.headers.get("x-id30-upload-part-number")?.trim(),
    );

    if (!token || !uploadSession || !Number.isSafeInteger(partNumber)) {
      return uploadError("Upload chunk headers are invalid.", 400);
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isSafeInteger(contentLength) &&
      contentLength > customerUploadMultipartPartSizeBytes
    ) {
      return uploadError("Upload chunk is too large.", 413);
    }

    const body = Buffer.from(await request.arrayBuffer());
    const part = await uploadCustomerUploadMultipartPart({
      body,
      partNumber,
      token,
      uploadSession,
    });

    return NextResponse.json({ ok: true, ...part });
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
  return error instanceof Error ? error.message : "Upload chunk failed.";
}
