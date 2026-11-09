import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { emailMessageAccessWhere } from "@/lib/crm-resource-access";
import {
  emailAttachmentDisplaySelect,
  serializeEmailAttachments,
} from "@/lib/email/attachment-display";
import {
  archiveGmailAttachmentById,
  fetchGmailAttachmentResponse,
  gmailMessageIdFromMetadata,
} from "@/lib/email/gmail-attachment-storage";
import { prisma } from "@/lib/prisma";
import { revalidateStorageSupportData } from "@/lib/storage/support-data";

export const runtime = "nodejs";

const maxProviderDownloadBytes = 35 * 1024 * 1024;

function normalizedMimeType(value: string | null) {
  return value?.toLowerCase().split(";")[0]?.trim() ?? "";
}

function previewMimeType(mimeType: string | null, name: string) {
  const normalized = normalizedMimeType(mimeType);
  const normalizedName = name.toLowerCase();

  if (normalized === "application/pdf" || normalizedName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (
    [
      "image/avif",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ].includes(normalized)
  ) {
    return normalized;
  }
  if (["text/csv", "text/markdown", "text/plain"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "application/json" || normalizedName.endsWith(".json")) {
    return "application/json";
  }
  if (/\.(csv|log|md|txt)$/.test(normalizedName)) {
    return "text/plain; charset=utf-8";
  }

  return null;
}

function safeAsciiFilename(value: string) {
  return (
    value
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "attachment"
  );
}

function contentDisposition(fileName: string, download: boolean) {
  const mode = download ? "attachment" : "inline";
  return `${mode}; filename="${safeAsciiFilename(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function attachmentWithAccess(
  attachmentId: string,
  user: Awaited<ReturnType<typeof requireUser>>,
) {
  return prisma.emailAttachment.findFirst({
    where: {
      id: attachmentId,
      emailMessage: emailMessageAccessWhere(user),
    },
    select: {
      ...emailAttachmentDisplaySelect,
      emailMessage: {
        select: {
          attachments: true,
          htmlBody: true,
          mailbox: {
            select: {
              authConnectionId: true,
              status: true,
            },
          },
          metadata: true,
          provider: true,
        },
      },
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const user = await requireUser();
  const { attachmentId } = await context.params;
  const attachment = await attachmentWithAccess(attachmentId, user);

  if (!attachment) {
    return NextResponse.json(
      { message: "Email attachment not found." },
      { status: 404 },
    );
  }

  if (attachment.fileAsset) {
    const download = new URL(request.url).searchParams.has("download");
    const pathname = download
      ? `/api/media/${encodeURIComponent(attachment.fileAsset.id)}?download=1`
      : `/api/media/${encodeURIComponent(attachment.fileAsset.id)}/preview`;
    return NextResponse.redirect(new URL(pathname, request.url));
  }

  const providerAttachmentId = attachment.providerAttachmentId;
  const gmailMessageId = gmailMessageIdFromMetadata(
    attachment.emailMessage.metadata,
  );
  const mailbox = attachment.emailMessage.mailbox;
  if (
    attachment.emailMessage.provider !== "gmail" ||
    !providerAttachmentId ||
    providerAttachmentId.startsWith("inline:") ||
    !gmailMessageId ||
    !mailbox ||
    mailbox.status !== "CONNECTED"
  ) {
    return NextResponse.json(
      {
        message:
          "This attachment is no longer available from the connected mailbox.",
      },
      { status: 410 },
    );
  }

  if ((attachment.sizeBytes ?? 0) > maxProviderDownloadBytes) {
    return NextResponse.json(
      { message: "This attachment is too large to retrieve through the CRM." },
      { status: 413 },
    );
  }

  const download = new URL(request.url).searchParams.has("download");
  const contentType = download
    ? normalizedMimeType(attachment.mimeType) || "application/octet-stream"
    : previewMimeType(attachment.mimeType, attachment.fileName);
  if (!contentType) {
    return NextResponse.json(
      { message: "Preview is not available for this file type." },
      { status: 415 },
    );
  }

  try {
    const providerResponse = await fetchGmailAttachmentResponse({
      authConnectionId: mailbox.authConnectionId,
      gmailMessageId,
      providerAttachmentId,
    });
    const providerLength = Number(
      providerResponse.headers.get("content-length"),
    );
    if (
      Number.isFinite(providerLength) &&
      providerLength > maxProviderDownloadBytes
    ) {
      return NextResponse.json(
        { message: "This attachment is too large to retrieve through the CRM." },
        { status: 413 },
      );
    }

    return new Response(providerResponse.body, {
      headers: {
        "Cache-Control": download
          ? "private, no-store"
          : "private, max-age=300",
        "Content-Disposition": contentDisposition(
          attachment.fileName,
          download,
        ),
        ...(Number.isFinite(providerLength)
          ? { "Content-Length": String(providerLength) }
          : {}),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    console.error("Gmail attachment retrieval failed", {
      attachmentId: attachment.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { message: "The attachment could not be retrieved from Gmail." },
      { status: 502 },
    );
  }
}

export async function POST(
  _: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const user = await requireUser();
  const { attachmentId } = await context.params;
  const accessibleAttachment = await attachmentWithAccess(attachmentId, user);

  if (!accessibleAttachment) {
    return NextResponse.json(
      { message: "Email attachment not found." },
      { status: 404 },
    );
  }

  try {
    await archiveGmailAttachmentById({ attachmentId, uploadedById: user.id });
    revalidatePath("/storage");
    revalidatePath("/sales");
    revalidatePath("/contacts");
    revalidateStorageSupportData();
    const attachment = await attachmentWithAccess(attachmentId, user);
    if (!attachment) throw new Error("Saved attachment could not be reloaded.");

    return NextResponse.json({
      attachment: serializeEmailAttachments(
        [attachment],
        attachment.emailMessage.attachments,
        attachment.emailMessage.htmlBody,
        attachment.emailMessage.provider,
      )[0],
    });
  } catch (error) {
    console.error("Save Gmail attachment failed", {
      attachmentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "The attachment could not be saved to CRM storage.",
      },
      { status: 502 },
    );
  }
}
