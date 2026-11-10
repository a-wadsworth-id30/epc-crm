import { FileAssetVisibility } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeFileAssetAccess } from "@/lib/storage/authorization";
import { safeFilePreviewContentType } from "@/lib/storage/preview";
import { getR2ObjectStream } from "@/lib/storage/r2";

type R2ObjectBody = Awaited<ReturnType<typeof getR2ObjectStream>>["body"];

function safeAsciiFilename(value: string) {
  const fallback = value
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .trim();

  return fallback || "document";
}

function inlineContentDisposition(fileName: string) {
  return `inline; filename="${safeAsciiFilename(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function hasWebStreamBody(
  body: unknown,
): body is { transformToWebStream: () => ReadableStream } {
  return (
    typeof body === "object" &&
    body !== null &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  );
}

function hasByteArrayBody(
  body: unknown,
): body is { transformToByteArray: () => Promise<Uint8Array> } {
  return (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  );
}

async function responseBody(body: R2ObjectBody): Promise<BodyInit> {
  const unknownBody: unknown = body;

  if (hasWebStreamBody(unknownBody)) return unknownBody.transformToWebStream();
  if (hasByteArrayBody(unknownBody)) {
    const bytes = await unknownBody.transformToByteArray();
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);

    new Uint8Array(arrayBuffer).set(bytes);

    return new Blob([arrayBuffer]);
  }

  throw new Error("R2 object body could not be read.");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ fileAssetId: string }> },
) {
  const { fileAssetId } = await context.params;
  const fileAsset = await prisma.fileAsset.findUnique({
    where: { id: fileAssetId },
  });

  if (!fileAsset) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  const contentType = safeFilePreviewContentType({
    mimeType: fileAsset.mimeType,
    name: fileAsset.originalName,
  });

  if (!contentType) {
    return NextResponse.json(
      { message: "Preview is not available for this file type." },
      { status: 415 },
    );
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

  const range = request.headers.get("range");
  const object = await getR2ObjectStream({
    key: fileAsset.key,
    range: range?.startsWith("bytes=") ? range : null,
  });
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    "Content-Disposition": inlineContentDisposition(fileAsset.originalName),
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  });

  if (object.contentLength !== null) {
    headers.set("Content-Length", String(object.contentLength));
  }

  if (object.contentRange) {
    headers.set("Content-Range", object.contentRange);
  }

  if (object.eTag) {
    headers.set("ETag", object.eTag);
  }

  if (object.lastModified) {
    headers.set("Last-Modified", object.lastModified.toUTCString());
  }

  return new Response(await responseBody(object.body), {
    headers,
    status: object.contentRange ? 206 : 200,
  });
}
