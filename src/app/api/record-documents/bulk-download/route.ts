import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canAccessRecordDocumentEntity,
  isRecordDocumentEntityType,
} from "@/lib/record-document-records";
import { getR2ObjectBytes } from "@/lib/storage/r2";
import { createStoredZip } from "@/lib/storage/zip";

export const runtime = "nodejs";

const maxZipDocuments = 100;
const maxZipBytes = 200 * 1024 * 1024;

function selectedDocumentIds(formData: FormData) {
  const ids: string[] = [];
  const seen = new Set<string>();

  formData.getAll("fileIds").forEach((value) => {
    if (typeof value !== "string") return;
    const id = value.trim();

    if (!id || seen.has(id)) return;

    seen.add(id);
    ids.push(id);
  });

  return ids;
}

function archiveName(entityType: string) {
  const date = new Date().toISOString().slice(0, 10);

  return `${entityType.toLowerCase()}-documents-${date}.zip`;
}

export async function POST(request: Request) {
  const user = await requireUser();
  const formData = await request.formData();
  const entityId = String(formData.get("entityId") ?? "").trim();
  const entityType = String(formData.get("entityType") ?? "").trim();
  const fileIds = selectedDocumentIds(formData);

  if (!entityId || !isRecordDocumentEntityType(entityType)) {
    return NextResponse.json(
      { message: "Record details are missing." },
      { status: 400 },
    );
  }

  if (!fileIds.length) {
    return NextResponse.json(
      { message: "Select at least one document." },
      { status: 400 },
    );
  }

  if (fileIds.length > maxZipDocuments) {
    return NextResponse.json(
      { message: `Select ${maxZipDocuments} documents or fewer at once.` },
      { status: 400 },
    );
  }

  const record = await canAccessRecordDocumentEntity({
    entityId,
    entityType,
    user,
  });

  if (!record) {
    return NextResponse.json({ message: "Record not found." }, { status: 404 });
  }

  const files = await prisma.fileAsset.findMany({
    where: {
      entityId,
      entityType,
      id: { in: fileIds },
    },
    select: {
      createdAt: true,
      id: true,
      key: true,
      originalName: true,
      sizeBytes: true,
      updatedAt: true,
    },
  });

  if (files.length !== fileIds.length) {
    return NextResponse.json(
      { message: "Some selected documents were not found on this record." },
      { status: 400 },
    );
  }

  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);

  if (totalBytes > maxZipBytes) {
    return NextResponse.json(
      { message: "Selected documents are too large for one ZIP download." },
      { status: 413 },
    );
  }

  try {
    const zip = createStoredZip(
      await Promise.all(
        files.map(async (file) => ({
          data: await getR2ObjectBytes({ key: file.key }),
          modifiedAt: file.updatedAt ?? file.createdAt,
          name: file.originalName,
        })),
      ),
    );

    return new Response(zip, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${archiveName(entityType)}"`,
        "Content-Length": String(zip.length),
        "Content-Type": "application/zip",
      },
    });
  } catch (error) {
    console.error("Bulk document ZIP failed", error);
    return NextResponse.json(
      { message: "The ZIP download could not be prepared." },
      { status: 502 },
    );
  }
}
