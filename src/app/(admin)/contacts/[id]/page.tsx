import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DeferredContactDeleteModal,
  DeferredContactEditModal,
  DeferredContactMergeModal,
} from "@/components/crm-boilerplate/ContactModalLoaders";
import type { ContactFormValues } from "@/components/crm-boilerplate/ContactForm";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import LazyContactConversationWorkspace from "@/components/crm-boilerplate/LazyContactConversationWorkspace";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import RecordDocumentLibrary from "@/components/crm-boilerplate/RecordDocumentLibrary";
import type { SaleConversationItem } from "@/components/crm-boilerplate/SaleConversationThread";
import { DeferredAddSaleModal } from "@/components/crm-boilerplate/SalesRouteLoaders";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { ChevronLeftIcon } from "@/icons";
import { getCurrentUser, requireUser } from "@/lib/auth";
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
} from "@/lib/contact-methods";
import {
  companyAccessWhere,
  contactAccessWhere,
  contactIdAccessWhere,
  salesOpportunityAccessWhere,
} from "@/lib/crm-resource-access";
import { listRecordCustomerDocumentShares } from "@/lib/customer-document-share-list";
import { listRecordCustomerDocumentPortals } from "@/lib/customer-document-portal-list";
import { listRecordCustomerUploadRequests } from "@/lib/customer-upload-request-list";
import { parseDocumentLibrarySettings } from "@/lib/document-library";
import { latestEmailReplyText, toEmailPlainText } from "@/lib/email/plain-text";
import { isGeoapifyAddressLookupEnabled } from "@/lib/integrations/geoapify";
import { prisma } from "@/lib/prisma";
import {
  parseSalesDefaults,
  resolveSalesDefaultOwnerId,
} from "@/lib/sales/defaults";
import { syncStaleOutboundSmsStatuses } from "@/lib/sales/sms-status-sync";
import { getCrmSettings } from "@/lib/settings";
import { listRecordSignatureRequests } from "@/lib/signature-request-list";
import { mediaAssetUrl } from "@/lib/storage/media";
import { cloudflareR2Provider, r2StoredConfigSchema } from "@/lib/storage/r2";

type ContactPageProps = {
  params: Promise<{ id: string }>;
};

type ContactSummaryMethod = {
  href: string;
  label: string;
  value: string;
};

function contactName(contact: { firstName: string; lastName: string } | null) {
  if (!contact) return "";

  return `${contact.firstName} ${contact.lastName}`.trim();
}

function formatJourneyDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatMoney(valueCents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function phoneHref(value: string) {
  const normalized = value.replace(/[^\d+]/g, "");
  return `tel:${normalized || value}`;
}

function touchParams(touch: unknown) {
  return jsonObject(jsonObject(touch).params);
}

function touchLabel(touch: unknown) {
  const params = touchParams(touch);

  return (
    [
      stringValue(params.utm_source) || stringValue(jsonObject(touch).source),
      stringValue(params.utm_medium) || stringValue(jsonObject(touch).medium),
      stringValue(params.utm_campaign) ||
        stringValue(jsonObject(touch).campaign),
    ]
      .filter(Boolean)
      .join(" / ") || "Website"
  );
}

function touchDate(touch: unknown) {
  const timestamp =
    stringValue(jsonObject(touch).capturedAt) ||
    stringValue(jsonObject(touch).timestamp) ||
    stringValue(jsonObject(touch).time);
  if (!timestamp) return null;

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function touchUrl(touch: unknown) {
  const data = jsonObject(touch);
  return (
    stringValue(data.url) ||
    stringValue(data.landingPage) ||
    stringValue(data.currentPage) ||
    stringValue(data.referrer)
  );
}

function timelineItems(value: unknown) {
  const data = jsonObject(value);
  const candidates = [
    value,
    data.events,
    data.items,
    data.touches,
    data.touchpoints,
    data.timeline,
  ];
  const items: unknown[] = [];

  candidates.forEach((candidate) => {
    if (Array.isArray(candidate)) {
      items.push(...candidate);
    }
  });

  return items.filter((item) => Object.keys(jsonObject(item)).length > 0);
}

function attributionTouchpoints(value: unknown) {
  const attribution = jsonObject(value);
  const touchpoints: unknown[] = [];

  if (Object.keys(jsonObject(attribution.firstTouch)).length > 0) {
    touchpoints.push(attribution.firstTouch);
  }

  timelineItems(attribution.timeline).forEach((touch) =>
    touchpoints.push(touch),
  );

  if (Object.keys(jsonObject(attribution.lastTouch)).length > 0) {
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

function opportunityIsClosed(stage: string, closedAt: Date | null) {
  return Boolean(closedAt) || stage === "WON" || stage === "LOST";
}

function formatAddress(contact: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
}) {
  return [
    contact.addressLine1,
    contact.addressLine2,
    contact.city,
    contact.county,
    contact.postcode,
    contact.country,
  ].filter((line): line is string => Boolean(line));
}

function websiteDetailFromTouchpoint(touchpoint: {
  url: string | null;
  landingPage: string | null;
  referrer: string | null;
}) {
  return (
    touchpoint.url ||
    touchpoint.landingPage ||
    touchpoint.referrer ||
    "Website page viewed"
  );
}

function websiteBadgeFromTouchpoint(touchpoint: {
  role: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
}) {
  return (
    [touchpoint.source, touchpoint.medium, touchpoint.campaign]
      .filter(Boolean)
      .join(" / ") || formatEnumLabel(touchpoint.role)
  );
}

function metadataWithCallDetails(call: {
  metadata: unknown;
  recordingSid: string | null;
  recordingUrl: string | null;
  status: string;
}) {
  return {
    ...jsonObject(call.metadata),
    recordingSid: call.recordingSid,
    recordingUrl: call.recordingUrl,
    status: formatEnumLabel(call.status),
  };
}

export async function generateMetadata({
  params,
}: ContactPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return { title: "Contact | Contacts" };
  }

  const contact = await prisma.contact.findFirst({
    where: contactIdAccessWhere(id, user),
    select: { firstName: true, lastName: true },
  });

  return {
    title: contact
      ? `${contactName(contact)} | Contacts`
      : "Contact | Contacts",
  };
}

export default async function ContactDetailPage({ params }: ContactPageProps) {
  const { id } = await params;
  const user = await requireUser();
  const opportunityAccessWhere = salesOpportunityAccessWhere(user);
  const accessibleOpportunityWhere =
    user.role === "ADMIN" ? undefined : opportunityAccessWhere;
  const settings = await getCrmSettings();
  const mergeCandidateWhere: Prisma.ContactWhereInput = {
    AND: [{ id: { not: id } }, contactAccessWhere(user)],
  };
  const [
    contact,
    activeUsers,
    pipelineStages,
    companies,
    availableTags,
    mergeCandidateContacts,
    addressLookupEnabled,
    contactDocuments,
    contactUploadRequests,
    contactDocumentShares,
    contactDocumentPortals,
    contactSignatureRequests,
    r2Integration,
  ] = await Promise.all([
    prisma.contact.findFirst({
      where: contactIdAccessWhere(id, user),
      select: {
        additionalEmails: {
          orderBy: { createdAt: "asc" },
          select: { email: true, id: true, label: true },
        },
        additionalPhones: {
          orderBy: { createdAt: "asc" },
          select: { id: true, label: true, phone: true, phoneNormalized: true },
        },
        addressLine1: true,
        addressLine2: true,
        attribution: true,
        city: true,
        companyId: true,
        companyName: true,
        country: true,
        county: true,
        createdAt: true,
        email: true,
        firstName: true,
        id: true,
        lastName: true,
        leadSource: true,
        phone: true,
        postcode: true,
        role: true,
        company: {
          select: { name: true },
        },
        tagAssignments: {
          orderBy: { tag: { name: "asc" } },
          select: {
            tag: {
              select: { id: true, name: true },
            },
          },
        },
        opportunities: {
          where: accessibleOpportunityWhere,
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            attribution: true,
            closedAt: true,
            createdAt: true,
            currency: true,
            id: true,
            source: true,
            stage: true,
            title: true,
            updatedAt: true,
            valueCents: true,
            owner: { select: { name: true } },
            salesPipelineStage: { select: { name: true, color: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.salesPipelineStage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        bucket: true,
        id: true,
        name: true,
      },
    }),
    settings.companiesEnabled
      ? prisma.company.findMany({
          where:
            user.role === "ADMIN"
              ? {}
              : {
                  OR: [
                    companyAccessWhere(user),
                    { contacts: { some: contactIdAccessWhere(id, user) } },
                  ],
                },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    prisma.contactTag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.contact.findMany({
      where: mergeCandidateWhere,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 250,
      select: {
        additionalEmails: {
          orderBy: { createdAt: "asc" },
          select: { email: true, id: true, label: true },
        },
        additionalPhones: {
          orderBy: { createdAt: "asc" },
          select: { id: true, label: true, phone: true, phoneNormalized: true },
        },
        companyName: true,
        email: true,
        firstName: true,
        id: true,
        lastName: true,
        phone: true,
        company: {
          select: { name: true },
        },
        _count: {
          select: {
            callLogs: true,
            emailMessages: true,
            notes: true,
            opportunities: true,
            queueEntries: true,
            salesCommunications: true,
            tagAssignments: true,
            tasks: true,
          },
        },
      },
    }),
    isGeoapifyAddressLookupEnabled(),
    prisma.fileAsset.findMany({
      where: { entityId: id, entityType: "Contact" },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        createdAt: true,
        documentFolder: true,
        id: true,
        mimeType: true,
        notes: true,
        originalName: true,
        sizeBytes: true,
        tags: true,
        uploadedBy: { select: { email: true, name: true } },
      },
    }),
    listRecordCustomerUploadRequests({
      entityId: id,
      entityType: "Contact",
    }),
    listRecordCustomerDocumentShares({
      entityId: id,
      entityType: "Contact",
    }),
    listRecordCustomerDocumentPortals({
      entityId: id,
      entityType: "Contact",
    }),
    listRecordSignatureRequests({
      entityId: id,
      entityType: "Contact",
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: cloudflareR2Provider },
      select: { config: true },
    }),
  ]);

  if (!contact) {
    notFound();
  }

  const opportunityIds = contact.opportunities.map(
    (opportunity) => opportunity.id,
  );
  const linkedOpportunityWhere = opportunityIds.length
    ? { opportunityId: { in: opportunityIds } }
    : { id: "__never__" };
  const optionalLinkedRecordWhere = opportunityIds.length
    ? { opportunityId: { in: opportunityIds } }
    : { id: "__never__" };
  const contactActivityWhere =
    user.role === "ADMIN"
      ? {
          OR: [
            { contactId: contact.id, opportunityId: null },
            optionalLinkedRecordWhere,
          ],
        }
      : optionalLinkedRecordWhere;
  const [communications, calls, emailMessages, attributionRecords] =
    await Promise.all([
      prisma.salesCommunication.findMany({
        where: linkedOpportunityWhere,
        orderBy: { occurredAt: "desc" },
        take: 100,
        select: {
          body: true,
          channel: true,
          direction: true,
          emailMessage: {
            select: { id: true },
          },
          externalId: true,
          fromAddress: true,
          id: true,
          metadata: true,
          occurredAt: true,
          opportunity: {
            select: { title: true },
          },
          opportunityId: true,
          subject: true,
          summary: true,
          toAddress: true,
          updatedAt: true,
          user: {
            select: { name: true },
          },
        },
      }),
      prisma.callLog.findMany({
        where: contactActivityWhere,
        orderBy: { startedAt: "desc" },
        take: 100,
        select: {
          direction: true,
          durationSeconds: true,
          fromNumber: true,
          id: true,
          metadata: true,
          recordingSid: true,
          recordingUrl: true,
          startedAt: true,
          status: true,
          toNumber: true,
          user: {
            select: { name: true },
          },
        },
      }),
      prisma.emailMessage.findMany({
        where: contactActivityWhere,
        orderBy: { receivedAt: "desc" },
        take: 100,
        select: {
          direction: true,
          fromAddress: true,
          id: true,
          opportunity: {
            select: { title: true },
          },
          opportunityId: true,
          receivedAt: true,
          status: true,
          subject: true,
          summary: true,
          textBody: true,
          toAddress: true,
        },
      }),
      prisma.attributionRecord.findMany({
        where: contactActivityWhere,
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          createdAt: true,
          id: true,
          opportunityId: true,
          visitorId: true,
          touchpoints: {
            orderBy: [{ capturedAt: "asc" }, { position: "asc" }],
            select: {
              id: true,
              role: true,
              position: true,
              source: true,
              medium: true,
              campaign: true,
              url: true,
              landingPage: true,
              referrer: true,
              capturedAt: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

  const syncedCommunications =
    await syncStaleOutboundSmsStatuses(communications);
  const communicationEmailIds = new Set(
    syncedCommunications
      .map((communication) => communication.emailMessage?.id)
      .filter((value): value is string => Boolean(value)),
  );
  const name = contactName(contact);
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const documentLibrary = parseDocumentLibrarySettings(
    settings.documentLibrary,
  );
  const r2Config = r2StoredConfigSchema.safeParse(r2Integration?.config ?? {});
  const documentUploadPolicy = {
    allowedMimeTypes: r2Config.success ? r2Config.data.allowedMimeTypes : "",
    isConfigured: Boolean(r2Config.success && r2Config.data.credentials),
    maxUploadMb: r2Config.success ? r2Config.data.maxUploadMb : 25,
  };
  const recordDocuments = contactDocuments.map((document) => ({
    createdAt: document.createdAt.toISOString(),
    documentFolder: document.documentFolder,
    id: document.id,
    mimeType: document.mimeType,
    name: document.originalName,
    notes: document.notes,
    sizeBytes: document.sizeBytes,
    tags: document.tags,
    uploadedBy:
      document.uploadedBy?.name || document.uploadedBy?.email || "CRM user",
    url: mediaAssetUrl(document.id),
  }));
  const companyName = contact.company?.name ?? contact.companyName ?? null;
  const saleOwnerOptions = activeUsers.map((activeUser) => ({
    label: activeUser.name,
    value: activeUser.id,
  }));
  const activePipelineStageOptions = pipelineStages.map((stage) => ({
    bucket: stage.bucket,
    label: stage.name,
    value: stage.id,
  }));
  const contactTags = contact.tagAssignments.map((assignment) => ({
    id: assignment.tag.id,
    name: assignment.tag.name,
  }));
  const additionalEmails = normalizeContactEmailMethods(
    contact.additionalEmails,
    contact.email,
  );
  const additionalPhones = normalizeContactPhoneMethods(
    contact.additionalPhones,
    contact.phone,
  );
  const recipientEmail = contact.email ?? additionalEmails[0]?.email ?? null;
  const recipientPhone = contact.phone ?? additionalPhones[0]?.phone ?? null;
  const summaryEmailMethods: ContactSummaryMethod[] = [
    ...(contact.email
      ? [
          {
            href: `mailto:${contact.email}`,
            label: "Primary",
            value: contact.email,
          },
        ]
      : []),
    ...additionalEmails.map((method) => ({
      href: `mailto:${method.email}`,
      label: method.label,
      value: method.email,
    })),
  ];
  const summaryPhoneMethods: ContactSummaryMethod[] = [
    ...(contact.phone
      ? [
          {
            href: phoneHref(contact.phone),
            label: "Primary",
            value: contact.phone,
          },
        ]
      : []),
    ...additionalPhones.map((method) => ({
      href: phoneHref(method.phone),
      label: method.label,
      value: method.phone,
    })),
  ];
  const editableContact: ContactFormValues = {
    addressLine1: contact.addressLine1,
    addressLine2: contact.addressLine2,
    additionalEmails,
    additionalPhones,
    city: contact.city,
    companyId: contact.companyId,
    companyName,
    country: contact.country,
    county: contact.county,
    email: contact.email,
    firstName: contact.firstName,
    id: contact.id,
    lastName: contact.lastName,
    leadSource: contact.leadSource,
    phone: contact.phone,
    postcode: contact.postcode,
    role: contact.role,
    tags: contactTags,
  };
  const mergeCandidates = mergeCandidateContacts.map((candidate) => {
    const candidateEmail =
      candidate.email ??
      normalizeContactEmailMethods(
        candidate.additionalEmails,
        candidate.email,
      )[0]?.email ??
      null;
    const candidatePhone =
      candidate.phone ??
      normalizeContactPhoneMethods(
        candidate.additionalPhones,
        candidate.phone,
      )[0]?.phone ??
      null;

    return {
      companyName: candidate.company?.name ?? candidate.companyName,
      email: candidateEmail,
      id: candidate.id,
      name: contactName(candidate) || candidateEmail || "Unnamed contact",
      phone: candidatePhone,
      relatedCount:
        candidate._count.callLogs +
        candidate._count.emailMessages +
        candidate._count.notes +
        candidate._count.opportunities +
        candidate._count.queueEntries +
        candidate._count.salesCommunications +
        candidate._count.tagAssignments +
        candidate._count.tasks,
    };
  });
  const websiteAttributionItems: SaleConversationItem[] = [
    ...contact.opportunities.flatMap((opportunity) =>
      attributionTouchpoints(opportunity.attribution).map((touch, index) => ({
        id: `opportunity-attribution-${opportunity.id}-${index}`,
        channel: "WEBSITE",
        direction: "INTERNAL",
        subject: index === 0 ? "Landed on website" : "Visited website page",
        summary: touchUrl(touch) || "Website page viewed",
        body: touchUrl(touch) || "Website page viewed",
        fromAddress: null,
        toAddress: null,
        occurredAt: (touchDate(touch) ?? opportunity.createdAt).toISOString(),
        userName: null,
        contactName: name,
        metadata: {
          status: touchLabel(touch),
          opportunityId: opportunity.id,
          opportunityTitle: opportunity.title,
        },
      })),
    ),
    ...attributionTouchpoints(contact.attribution).map((touch, index) => ({
      id: `contact-attribution-${contact.id}-${index}`,
      channel: "WEBSITE",
      direction: "INTERNAL",
      subject: index === 0 ? "Landed on website" : "Visited website page",
      summary: touchUrl(touch) || "Website page viewed",
      body: touchUrl(touch) || "Website page viewed",
      fromAddress: null,
      toAddress: null,
      occurredAt: (touchDate(touch) ?? contact.createdAt).toISOString(),
      userName: null,
      contactName: name,
      metadata: {
        status: touchLabel(touch),
        attributionSource: "contact",
      },
    })),
  ];
  const conversationItems: SaleConversationItem[] = [
    ...syncedCommunications.map((communication) => ({
      id: `communication-${communication.id}`,
      channel: communication.channel,
      direction: communication.direction,
      subject:
        communication.subject ||
        `${formatEnumLabel(communication.direction)} ${formatEnumLabel(
          communication.channel,
        )}`,
      summary:
        toEmailPlainText(communication.summary) ||
        "Sales communication captured",
      body:
        (communication.channel === "EMAIL"
          ? latestEmailReplyText(communication.body)
          : toEmailPlainText(communication.body)) || null,
      fromAddress: communication.fromAddress,
      toAddress: communication.toAddress,
      occurredAt: communication.occurredAt.toISOString(),
      userName: communication.user?.name ?? null,
      contactName: name,
      metadata: {
        ...jsonObject(communication.metadata),
        opportunityId: communication.opportunityId,
        opportunityTitle: communication.opportunity.title,
      },
    })),
    ...calls.map((call) => ({
      id: `call-${call.id}`,
      channel: "PHONE",
      direction: call.direction,
      subject: `${formatEnumLabel(call.direction)} call`,
      summary:
        [
          call.fromNumber ? `From ${call.fromNumber}` : null,
          call.toNumber ? `to ${call.toNumber}` : null,
          call.durationSeconds ? `${call.durationSeconds}s` : null,
        ]
          .filter(Boolean)
          .join(" ") || "Phone call captured",
      body: call.recordingUrl,
      fromAddress: call.fromNumber,
      toAddress: call.toNumber,
      occurredAt: call.startedAt.toISOString(),
      userName: call.user?.name ?? null,
      contactName: name,
      metadata: metadataWithCallDetails(call),
    })),
    ...emailMessages
      .filter((email) => !communicationEmailIds.has(email.id))
      .map((email) => ({
        id: `email-${email.id}`,
        channel: "EMAIL",
        direction: email.direction,
        subject: email.subject || `${formatEnumLabel(email.direction)} email`,
        summary: toEmailPlainText(email.summary) || "Email captured",
        body: latestEmailReplyText(email.textBody) || null,
        fromAddress: email.fromAddress,
        toAddress: email.toAddress,
        occurredAt: email.receivedAt.toISOString(),
        userName: null,
        contactName: name,
        metadata: {
          status: formatEnumLabel(email.status),
          opportunityId: email.opportunityId,
          opportunityTitle: email.opportunity?.title,
        },
      })),
    ...attributionRecords.flatMap((record) =>
      record.touchpoints.map((touchpoint, index) => {
        const occurredAt =
          touchpoint.capturedAt ?? touchpoint.createdAt ?? record.createdAt;
        const title =
          touchpoint.role === "FIRST" || index === 0
            ? "Landed on website"
            : "Visited website page";

        return {
          id: `website-${record.id}-${touchpoint.id}`,
          channel: "WEBSITE",
          direction: "INTERNAL",
          subject: title,
          summary: websiteDetailFromTouchpoint(touchpoint),
          body: websiteDetailFromTouchpoint(touchpoint),
          fromAddress: null,
          toAddress: null,
          occurredAt: occurredAt.toISOString(),
          userName: null,
          contactName: name,
          metadata: {
            status: websiteBadgeFromTouchpoint(touchpoint),
            visitorId: record.visitorId,
            opportunityId: record.opportunityId,
            opportunityTitle:
              contact.opportunities.find(
                (opportunity) => opportunity.id === record.opportunityId,
              )?.title ?? null,
          },
        };
      }),
    ),
    ...websiteAttributionItems,
  ]
    .filter((item, index, items) => {
      const key = [
        item.channel,
        item.subject,
        item.summary,
        item.occurredAt,
      ].join("|");

      return (
        items.findIndex((candidate) => {
          const candidateKey = [
            candidate.channel,
            candidate.subject,
            candidate.summary,
            candidate.occurredAt,
          ].join("|");

          return candidateKey === key;
        }) === index
      );
    })
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    )
    .slice(0, 160);

  const openOpportunities = contact.opportunities.filter(
    (opportunity) =>
      !opportunityIsClosed(opportunity.stage, opportunity.closedAt),
  );
  const closedOpportunities = contact.opportunities.filter((opportunity) =>
    opportunityIsClosed(opportunity.stage, opportunity.closedAt),
  );
  const addressLines = formatAddress(contact);
  const replyTarget = openOpportunities[0] ?? contact.opportunities[0] ?? null;
  const contactProfilePanel = (
    <div className="p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Contact details
        </h2>
        <LazyHelpTooltip content="Stores the main email, phone and role details users need before contacting this person." />
      </div>
      <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Email</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {contact.email || additionalEmails.length ? (
              <ContactMethodList
                primaryLabel="Primary"
                primaryValue={contact.email}
                methods={additionalEmails.map((method) => ({
                  label: method.label,
                  value: method.email,
                }))}
              />
            ) : (
              "Not set"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Phone</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {contact.phone || additionalPhones.length ? (
              <ContactMethodList
                primaryLabel="Primary"
                primaryValue={contact.phone}
                methods={additionalPhones.map((method) => ({
                  label: method.label,
                  value: method.phone,
                }))}
              />
            ) : (
              "Not set"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Company</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {companyName ? (
              settings.companiesEnabled && contact.companyId ? (
                <Link
                  href={`/clients/${contact.companyId}`}
                  className="text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  {companyName}
                </Link>
              ) : (
                companyName
              )
            ) : (
              "Not set"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Lead source</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {contact.leadSource ?? "Not set"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Role</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {contact.role ?? "Not set"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Address</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {addressLines.length ? (
              <span className="block space-y-1">
                {addressLines.map((line, index) => (
                  <span key={`${line}-${index}`} className="block">
                    {line}
                  </span>
                ))}
              </span>
            ) : (
              "Not set"
            )}
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-gray-500 dark:text-gray-400">Tags</dt>
          <dd className="mt-2">
            {contact.tagAssignments.length ? (
              <div className="flex flex-wrap gap-1.5">
                {contactTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-gray-400">None</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
  const contactLeadsPanel = (
    <div className="grid gap-4 p-4 xl:grid-cols-2">
      <LeadListSection
        count={openOpportunities.length}
        emptyLabel="No open leads linked to this contact."
        title="Open leads"
        opportunities={openOpportunities}
      />
      <LeadListSection
        count={closedOpportunities.length}
        emptyLabel="No closed leads linked to this contact."
        title="Closed leads"
        opportunities={closedOpportunities}
      />
    </div>
  );
  const contactDocumentsPanel = (
    <div className="p-4 sm:p-5">
      <RecordDocumentLibrary
        documentPortals={contactDocumentPortals}
        documentShares={contactDocumentShares}
        documents={recordDocuments}
        entityId={contact.id}
        entityLabel={name}
        entityType="Contact"
        folders={documentLibrary.folders}
        signatureRequests={contactSignatureRequests}
        uploadRequests={contactUploadRequests}
        uploadPolicy={documentUploadPolicy}
      />
    </div>
  );

  return (
    <>
      <PageHeader
        title={name}
        description={companyName ?? "Contact workspace"}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <DeferredAddSaleModal
              defaultOwnerId={resolveSalesDefaultOwnerId({
                fallbackUserId: user.id,
                salesDefaults,
              })}
              defaultStageId={salesDefaults.defaultSalesPipelineStageId}
              linkedContact={{
                companyId: contact.companyId,
                companyName,
                id: contact.id,
                leadSource: contact.leadSource,
                name,
              }}
              owners={saleOwnerOptions}
              stages={activePipelineStageOptions}
              triggerLabel="Create lead"
            />
            <DeferredContactEditModal
              availableTags={availableTags}
              companies={companies}
              companiesEnabled={settings.companiesEnabled}
              contact={editableContact}
              addressLookupEnabled={addressLookupEnabled}
              triggerLabel="Edit"
            />
            <DeferredContactMergeModal
              candidates={mergeCandidates}
              contactId={contact.id}
              contactName={name}
              triggerLabel="Merge"
            />
            <DeferredContactDeleteModal
              contactId={contact.id}
              contactName={name}
              redirectTo="/contacts"
              triggerLabel="Delete"
            />
            <Link
              href="/contacts"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Contacts
            </Link>
          </div>
        }
      />

      <LazyContactConversationWorkspace
        closedLeadCount={closedOpportunities.length}
        communications={conversationItems}
        communicationsCount={conversationItems.length}
        contactId={contact.id}
        contactName={name}
        documentCount={recordDocuments.length}
        documentPanel={contactDocumentsPanel}
        leadsPanel={contactLeadsPanel}
        openLeadCount={openOpportunities.length}
        profilePanel={contactProfilePanel}
        recipientEmail={recipientEmail}
        recipientEmails={summaryEmailMethods}
        recipientPhone={recipientPhone}
        recipientPhones={summaryPhoneMethods}
        replyTarget={
          replyTarget
            ? {
                id: replyTarget.id,
                title: replyTarget.title,
                stage:
                  replyTarget.salesPipelineStage?.name ?? replyTarget.stage,
              }
            : null
        }
        summary={{
          companyName,
          leadSource: contact.leadSource,
          role: contact.role,
        }}
      />
    </>
  );
}

function ContactMethodList({
  methods,
  primaryLabel,
  primaryValue,
}: {
  methods: Array<{ label: string; value: string }>;
  primaryLabel: string;
  primaryValue: string | null;
}) {
  const rows = [
    ...(primaryValue ? [{ label: primaryLabel, value: primaryValue }] : []),
    ...methods,
  ];

  return (
    <span className="block space-y-2">
      {rows.map((method, index) => (
        <span
          key={`${method.label}-${method.value}-${index}`}
          className="block"
        >
          <span className="mr-2 inline-flex h-5 items-center rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-500 dark:bg-white/10 dark:text-gray-300">
            {method.label}
          </span>
          <span>{method.value}</span>
        </span>
      ))}
    </span>
  );
}

function LeadListSection({
  count,
  emptyLabel,
  opportunities,
  title,
}: {
  count: number;
  emptyLabel: string;
  opportunities: Array<{
    id: string;
    title: string;
    stage: string;
    valueCents: number;
    currency: string;
    owner: { name: string | null } | null;
    salesPipelineStage: { name: string; color: string | null } | null;
    source: string | null;
    updatedAt: Date;
  }>;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            {title}
          </h2>
          <LazyHelpTooltip content="Links to every lead connected to this contact so agents can move between historic and active sales context." />
        </div>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          {count}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {opportunities.length ? (
          opportunities.map((sale) => (
            <Link
              key={sale.id}
              href={`/sales/${sale.id}`}
              className="block rounded-xl border border-gray-200 p-3 text-sm transition hover:border-brand-200 hover:bg-brand-50/50 dark:border-gray-800 dark:hover:border-brand-900/40 dark:hover:bg-brand-900/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-800 dark:text-white/90">
                    {sale.title}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {[sale.source, sale.owner?.name ?? "Unassigned"]
                      .filter(Boolean)
                      .join(" · ")}
                    {" · Updated "}
                    {formatJourneyDate(sale.updatedAt)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {formatMoney(sale.valueCents, sale.currency)}
                </span>
              </div>
              <div className="mt-3">
                <StatusBadge>
                  {sale.salesPipelineStage?.name ?? sale.stage}
                </StatusBadge>
              </div>
            </Link>
          ))
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {emptyLabel}
          </p>
        )}
      </div>
    </section>
  );
}
