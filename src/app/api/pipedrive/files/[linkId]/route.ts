import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { salesOpportunityIdAccessWhere } from "@/lib/crm-resource-access";
import {
  getPipedriveReadOnlyClient,
  PipedriveApiError,
  pipedriveProvider,
} from "@/lib/integrations/pipedrive";
import { prisma } from "@/lib/prisma";

const pipedriveFileExternalType = "file";
const salesOpportunityInternalType = "salesOpportunity";

export async function GET(
  request: Request,
  context: { params: Promise<{ linkId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { linkId } = await context.params;
  const normalizedLinkId = String(linkId ?? "").trim();

  if (!normalizedLinkId) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  const link = await prisma.externalRecordLink.findFirst({
    where: {
      externalType: pipedriveFileExternalType,
      id: normalizedLinkId,
      internalType: salesOpportunityInternalType,
      provider: pipedriveProvider,
    },
    select: {
      externalId: true,
      internalId: true,
      metadata: true,
    },
  });

  if (!link) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(link.internalId, user),
    select: { id: true },
  });

  if (!sale) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  const fileId = pipedriveFileId(link.externalId);

  if (fileId === null) {
    return NextResponse.json(
      { message: "Pipedrive file link is invalid." },
      { status: 409 },
    );
  }

  const client = await getPipedriveReadOnlyClient();

  if (!client) {
    return NextResponse.json(
      { message: "Pipedrive is not configured." },
      { status: 503 },
    );
  }

  try {
    const response = await client.downloadFile(fileId);

    if (!response.body) {
      return NextResponse.json(
        { message: "Pipedrive file did not include a download body." },
        { status: 502 },
      );
    }

    const metadata = jsonObject(link.metadata);
    const fileName =
      stringValue(metadata.name) ??
      stringValue(metadata.pipedriveFileName) ??
      `pipedrive-file-${fileId}`;
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers();
    const contentType = responseContentType(response, metadata);
    const contentLength = response.headers.get("content-length");

    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", contentDisposition(fileName, download));
    headers.set("Content-Type", contentType);
    if (contentLength) headers.set("Content-Length", contentLength);

    return new Response(response.body, { headers, status: 200 });
  } catch (error) {
    if (error instanceof PipedriveApiError) {
      if (error.status === 404) {
        return NextResponse.json(
          { message: "Pipedrive file not found." },
          { status: 404 },
        );
      }

      if (error.status === 401 || error.status === 403) {
        return NextResponse.json(
          { message: "Pipedrive rejected the stored API token for this file." },
          { status: 502 },
        );
      }

      return NextResponse.json(
        { message: "Pipedrive file download failed." },
        { status: error.status === 504 ? 504 : 502 },
      );
    }

    console.error("Pipedrive file download failed", error);

    return NextResponse.json(
      { message: "Pipedrive file download failed." },
      { status: 502 },
    );
  }
}

function pipedriveFileId(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const id = Number(trimmed);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contentDisposition(fileName: string, download: boolean) {
  return `${download ? "attachment" : "inline"}; filename="${headerFileName(fileName)}"`;
}

function responseContentType(
  response: Response,
  metadata: Record<string, unknown>,
) {
  const providerContentType = response.headers.get("content-type");
  const metadataContentType = stringValue(metadata.pipedriveFileType);

  if (providerContentType && isSpecificContentType(providerContentType)) {
    return providerContentType;
  }
  if (metadataContentType && isSpecificContentType(metadataContentType)) {
    return metadataContentType;
  }

  return providerContentType || "application/octet-stream";
}

function isSpecificContentType(value: string) {
  const normalized = value.toLowerCase().split(";")[0]?.trim() ?? "";

  return normalized !== "" && normalized !== "application/octet-stream";
}

function headerFileName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\r\n"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return normalized || "pipedrive-file";
}
