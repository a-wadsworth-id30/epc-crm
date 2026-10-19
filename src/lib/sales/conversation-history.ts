import "server-only";

import type { CommunicationChannel, Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { salesOpportunityIdAccessWhere } from "@/lib/crm-resource-access";
import { latestEmailReplyText, toEmailPlainText } from "@/lib/email/plain-text";
import { pipedriveProvider } from "@/lib/integrations/pipedrive";
import { prisma } from "@/lib/prisma";
import {
  saleConversationPageSize,
  type SaleConversationCounts,
  type SaleConversationFilter,
  type SaleConversationItem,
  type SaleConversationPage,
} from "@/lib/sales/conversation-types";

const pipedriveFileExternalType = "file";
const salesOpportunityExternalType = "salesOpportunity";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function contactName(contact: { firstName: string; lastName: string } | null) {
  if (!contact) return null;

  return `${contact.firstName} ${contact.lastName}`.trim() || null;
}

function fileSizeLabel(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "Unknown size";
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

function fileTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("spreadsheet")) return "Spreadsheet";
  if (mimeType.includes("word") || mimeType.includes("document")) {
    return "Document";
  }
  return "File";
}

function externalFileTypeLabel(value: string | null) {
  if (!value) return null;
  if (value.includes("/")) return fileTypeLabel(value);
  if (value.length <= 8) return value.toUpperCase();
  return value;
}

function touchParams(touch: unknown) {
  return objectValue(objectValue(touch).params);
}

function touchLabel(touch: unknown) {
  const params = touchParams(touch);
  const source = stringValue(params.utm_source);
  const medium = stringValue(params.utm_medium);
  const campaign = stringValue(params.utm_campaign);

  return [source, medium, campaign].filter(Boolean).join(" / ") || "Unknown";
}

function touchDate(touch: unknown) {
  const record = objectValue(touch);
  const timestamp =
    stringValue(record.capturedAt) ||
    stringValue(record.timestamp) ||
    stringValue(record.time);
  if (!timestamp) return null;

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function touchUrl(touch: unknown) {
  const record = objectValue(touch);
  return (
    stringValue(record.url) ||
    stringValue(record.landingPage) ||
    stringValue(record.currentPage)
  );
}

function timelineItems(value: unknown) {
  const data = objectValue(value);
  const candidates = [
    value,
    data.events,
    data.items,
    data.touches,
    data.touchpoints,
    data.timeline,
  ];

  return candidates
    .flatMap((candidate) => (Array.isArray(candidate) ? candidate : []))
    .filter((item) => Object.keys(objectValue(item)).length > 0);
}

function attributionTouchpoints(value: unknown) {
  const attribution = objectValue(value);
  const touchpoints: unknown[] = [];

  if (Object.keys(objectValue(attribution.firstTouch)).length > 0) {
    touchpoints.push(attribution.firstTouch);
  }
  touchpoints.push(...timelineItems(attribution.timeline));
  if (Object.keys(objectValue(attribution.lastTouch)).length > 0) {
    touchpoints.push(attribution.lastTouch);
  }

  const seen = new Set<string>();
  return touchpoints.filter((touch) => {
    const key = [
      touchLabel(touch),
      touchDate(touch)?.toISOString() ?? "",
      touchUrl(touch) ?? "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatRole(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

const communicationSelect = {
  body: true,
  channel: true,
  contact: { select: { firstName: true, lastName: true } },
  direction: true,
  fromAddress: true,
  id: true,
  metadata: true,
  occurredAt: true,
  subject: true,
  summary: true,
  toAddress: true,
  user: { select: { name: true } },
} satisfies Prisma.SalesCommunicationSelect;

type CommunicationRow = Prisma.SalesCommunicationGetPayload<{
  select: typeof communicationSelect;
}>;

function serializeCommunication(
  communication: CommunicationRow,
): SaleConversationItem {
  const body = toEmailPlainText(communication.body);

  return {
    body:
      (communication.channel === "EMAIL" ? latestEmailReplyText(body) : body) ||
      null,
    channel: communication.channel,
    contactName: contactName(communication.contact),
    direction: communication.direction,
    fromAddress: communication.fromAddress,
    id: communication.id,
    metadata: communication.metadata,
    occurredAt: communication.occurredAt.toISOString(),
    subject: communication.subject,
    summary: toEmailPlainText(communication.summary),
    toAddress: communication.toAddress,
    userName: communication.user?.name ?? null,
  };
}

type PipedriveFileRow = {
  externalId: string;
  id: string;
  lastSeenAt: Date | null;
  metadata: unknown;
  updatedAt: Date;
};

function serializePipedriveFile(link: PipedriveFileRow): SaleConversationItem {
  const metadata = objectValue(link.metadata);
  const pipedriveAddedAt = dateValue(metadata.pipedriveAddTime);
  const pipedriveUpdatedAt = dateValue(metadata.pipedriveUpdateTime);
  const sizeBytes = numberValue(metadata.sizeBytes);
  const sizeLabel = sizeBytes !== null ? fileSizeLabel(sizeBytes) : null;
  const mimeType =
    stringValue(metadata.pipedriveFileType) ?? "application/octet-stream";
  const name =
    stringValue(metadata.name) ??
    stringValue(metadata.pipedriveFileName) ??
    `Pipedrive file ${link.externalId}`;
  const occurredAt =
    pipedriveAddedAt ?? pipedriveUpdatedAt ?? link.lastSeenAt ?? link.updatedAt;
  const typeLabel = externalFileTypeLabel(
    stringValue(metadata.pipedriveFileType),
  );

  return {
    body: null,
    channel: "SYSTEM",
    contactName: null,
    direction: "INTERNAL",
    fromAddress: null,
    id: `pipedrive-file:${link.id}`,
    metadata: {
      downloadUrl: `/api/pipedrive/files/${encodeURIComponent(link.id)}?download=1`,
      fileName: name,
      mimeType,
      previewUrl: `/api/pipedrive/files/${encodeURIComponent(link.id)}`,
      provider: "Pipedrive",
      sizeLabel,
      source: "pipedrive-file-import",
      typeLabel,
    },
    occurredAt: occurredAt.toISOString(),
    subject: "File added in Pipedrive",
    summary: [name, typeLabel, sizeLabel].filter(Boolean).join(" · "),
    toAddress: null,
    userName: null,
  };
}

type AttributionRecordRow = Awaited<
  ReturnType<typeof readWebsiteAttributionRecords>
>[number];

async function readWebsiteAttributionRecords(
  saleId: string,
  contactId: string | null,
) {
  return prisma.attributionRecord.findMany({
    where: contactId
      ? { OR: [{ opportunityId: saleId }, { contactId }] }
      : { opportunityId: saleId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      currentPage: true,
      firstTouch: true,
      id: true,
      landingPage: true,
      lastTouch: true,
      referrer: true,
      timeline: true,
      touchpoints: {
        orderBy: [{ capturedAt: "asc" }, { position: "asc" }],
        select: {
          campaign: true,
          capturedAt: true,
          createdAt: true,
          id: true,
          landingPage: true,
          medium: true,
          position: true,
          referrer: true,
          role: true,
          source: true,
          url: true,
        },
      },
    },
  });
}

function websitePageDetail(value: {
  landingPage: string | null;
  referrer: string | null;
  url: string | null;
}) {
  return value.url || value.landingPage || value.referrer || "Website page viewed";
}

function websiteSourceLabel(value: {
  campaign: string | null;
  medium: string | null;
  role: string;
  source: string | null;
}) {
  return (
    [value.source, value.medium, value.campaign].filter(Boolean).join(" / ") ||
    formatRole(value.role)
  );
}

function buildWebsiteItems({
  contactDisplayName,
  records,
  sale,
}: {
  contactDisplayName: string | null;
  records: AttributionRecordRow[];
  sale: { attribution: unknown; createdAt: Date; id: string };
}) {
  const saleItems: SaleConversationItem[] = attributionTouchpoints(
    sale.attribution,
  ).map((touch, index) => {
    const occurredAt = touchDate(touch) ?? sale.createdAt;
    const detail = touchUrl(touch) || "Website page viewed";
    const sourceLabel = touchLabel(touch);

    return {
      body: detail,
      channel: "WEBSITE",
      contactName: contactDisplayName,
      direction: "INTERNAL",
      fromAddress: null,
      id: `website-sale-${sale.id}-${index}`,
      metadata: { attributionSource: "lead", status: sourceLabel },
      occurredAt: occurredAt.toISOString(),
      subject: index === 0 ? "Landed on website" : "Visited website page",
      summary: sourceLabel ? `${detail} · ${sourceLabel}` : detail,
      toAddress: null,
      userName: null,
    };
  });
  const recordItems = records.flatMap((record) => {
    const rawAttribution = {
      firstTouch: record.firstTouch,
      lastTouch: record.lastTouch,
      timeline: record.timeline,
    };
    const rawTouches = attributionTouchpoints(rawAttribution);
    const touchpoints = record.touchpoints.length
      ? record.touchpoints
      : rawTouches.length
        ? rawTouches.map((touch, index) => ({
            campaign: null,
            capturedAt: touchDate(touch),
            createdAt: record.createdAt,
            id: `${record.id}-json-${index}`,
            landingPage: null,
            medium: null,
            position: index,
            referrer: null,
            role: index === 0 ? "FIRST" : "ASSISTED",
            source: null,
            url: touchUrl(touch),
          }))
        : record.landingPage || record.currentPage || record.referrer
          ? [
              {
                campaign: null,
                capturedAt: record.createdAt,
                createdAt: record.createdAt,
                id: `${record.id}-page`,
                landingPage: record.landingPage,
                medium: null,
                position: 0,
                referrer: record.referrer,
                role: "LAST",
                source: null,
                url: record.currentPage,
              },
            ]
          : [];

    return touchpoints.map((touchpoint, index): SaleConversationItem => {
      const occurredAt =
        touchpoint.capturedAt ?? touchpoint.createdAt ?? record.createdAt;
      const detail = websitePageDetail(touchpoint);
      const sourceLabel = websiteSourceLabel(touchpoint);

      return {
        body: detail,
        channel: "WEBSITE",
        contactName: contactDisplayName,
        direction: "INTERNAL",
        fromAddress: null,
        id: `website-${record.id}-${touchpoint.id}`,
        metadata: { attributionRecordId: record.id, status: sourceLabel },
        occurredAt: occurredAt.toISOString(),
        subject:
          touchpoint.role === "FIRST" || index === 0
            ? "Landed on website"
            : "Visited website page",
        summary: sourceLabel ? `${detail} · ${sourceLabel}` : detail,
        toAddress: null,
        userName: null,
      };
    });
  });

  return [...saleItems, ...recordItems]
    .filter(
      (item, index, items) =>
        items.findIndex(
          (candidate) =>
            candidate.subject === item.subject &&
            candidate.body === item.body &&
            candidate.occurredAt === item.occurredAt,
        ) === index,
    )
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );
}

function communicationChannels(filter: SaleConversationFilter) {
  if (filter === "SMS") return ["SMS", "WHATSAPP"] as CommunicationChannel[];
  if (["PHONE", "EMAIL", "NOTE"].includes(filter)) {
    return [filter as CommunicationChannel];
  }
  return null;
}

function emptyCounts(): SaleConversationCounts {
  return {
    ALL: 0,
    EMAIL: 0,
    FILE: 0,
    NOTE: 0,
    PHONE: 0,
    SMS: 0,
    WEBSITE: 0,
  };
}

export async function listSaleConversationPage({
  filter,
  page,
  saleId,
  user,
}: {
  filter: SaleConversationFilter;
  page: number;
  saleId: string;
  user: Pick<CurrentUser, "id" | "role">;
}): Promise<SaleConversationPage | null> {
  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(saleId, user),
    select: {
      attribution: true,
      contactId: true,
      createdAt: true,
      id: true,
      contact: { select: { firstName: true, lastName: true } },
    },
  });
  if (!sale) return null;

  const fileWhere = {
    externalType: pipedriveFileExternalType,
    internalId: saleId,
    internalType: salesOpportunityExternalType,
    provider: pipedriveProvider,
  } as const;
  const [communicationCounts, pipedriveFiles, attributionRecords] =
    await Promise.all([
      prisma.salesCommunication.groupBy({
        by: ["channel"],
        where: { opportunityId: saleId },
        _count: { _all: true },
      }),
      prisma.externalRecordLink.findMany({
        where: fileWhere,
        select: {
          externalId: true,
          id: true,
          lastSeenAt: true,
          metadata: true,
          updatedAt: true,
        },
      }),
      readWebsiteAttributionRecords(saleId, sale.contactId),
    ]);
  const pipedriveFileItems = pipedriveFiles
    .map(serializePipedriveFile)
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );
  const websiteItems = buildWebsiteItems({
    contactDisplayName: contactName(sale.contact),
    records: attributionRecords,
    sale,
  });
  const counts = emptyCounts();

  for (const row of communicationCounts) {
    counts.ALL += row._count._all;
    if (row.channel === "PHONE") counts.PHONE += row._count._all;
    if (row.channel === "EMAIL") counts.EMAIL += row._count._all;
    if (row.channel === "NOTE") counts.NOTE += row._count._all;
    if (row.channel === "SMS" || row.channel === "WHATSAPP") {
      counts.SMS += row._count._all;
    }
  }
  counts.FILE = pipedriveFileItems.length;
  counts.WEBSITE = websiteItems.length;
  counts.ALL += counts.FILE + counts.WEBSITE;

  const total = counts[filter];
  const totalPages = Math.max(1, Math.ceil(total / saleConversationPageSize));
  const resolvedPage = Math.min(Math.max(1, page), totalPages);
  const skip = (resolvedPage - 1) * saleConversationPageSize;
  let items: SaleConversationItem[] = [];

  if (filter === "FILE") {
    items = pipedriveFileItems.slice(skip, skip + saleConversationPageSize);
  } else if (filter === "WEBSITE") {
    items = websiteItems.slice(skip, skip + saleConversationPageSize);
  } else if (filter === "ALL") {
    const take = resolvedPage * saleConversationPageSize;
    const communications = await prisma.salesCommunication.findMany({
      where: { opportunityId: saleId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take,
      select: communicationSelect,
    });
    items = [
      ...communications.map(serializeCommunication),
      ...pipedriveFileItems.slice(0, take),
      ...websiteItems.slice(0, take),
    ]
      .sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      )
      .slice(skip, skip + saleConversationPageSize);
  } else {
    const channels = communicationChannels(filter) ?? [];
    const communications = await prisma.salesCommunication.findMany({
      where: { channel: { in: channels }, opportunityId: saleId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip,
      take: saleConversationPageSize,
      select: communicationSelect,
    });
    items = communications.map(serializeCommunication);
  }

  return {
    counts,
    filter,
    items,
    page: resolvedPage,
    pageSize: saleConversationPageSize,
    total,
    totalPages,
  };
}
