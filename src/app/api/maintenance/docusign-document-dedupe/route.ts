import { NextResponse } from "next/server";
import { runDocusignDuplicateDocumentCleanup } from "@/lib/maintenance/docusign-document-dedupe";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function cleanupSecret() {
  return process.env.DOCUSIGN_DOCUMENT_CLEANUP_SECRET || "";
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function isAuthorized(request: Request) {
  const secret = cleanupSecret();
  if (!secret) return false;

  return (
    bearerToken(request) === secret ||
    request.headers.get("x-maintenance-secret") === secret
  );
}

function booleanQuery(request: Request, key: string, defaultValue = false) {
  const value = new URL(request.url).searchParams.get(key) ?? "";
  if (!value) return defaultValue;

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function stringQuery(request: Request, key: string) {
  return new URL(request.url).searchParams.get(key)?.trim() || null;
}

async function cleanupResponse(request: Request, dryRun: boolean) {
  if (!cleanupSecret()) {
    return NextResponse.json(
      {
        ok: false,
        message: "DOCUSIGN_DOCUMENT_CLEANUP_SECRET is not configured.",
      },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Unauthorized.",
      },
      { status: 401 },
    );
  }

  try {
    const result = await runDocusignDuplicateDocumentCleanup({
      applyChanges: !dryRun,
      entityIdFilter: stringQuery(request, "entityId"),
      entityTypeFilter: stringQuery(request, "entityType"),
      prismaClient: prisma,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("DocuSign duplicate document cleanup failed", error);

    return NextResponse.json(
      {
        ok: false,
        message: "DocuSign duplicate document cleanup failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return cleanupResponse(request, true);
}

export async function POST(request: Request) {
  return cleanupResponse(request, booleanQuery(request, "dryRun"));
}
