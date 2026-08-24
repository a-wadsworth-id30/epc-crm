import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttributionSourceIconSlot } from "@/components/crm-boilerplate/AttributionSourceIcon";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import RecordDocumentLibrary from "@/components/crm-boilerplate/RecordDocumentLibrary";
import {
  PipedriveLeadNotesAutoSync,
  PipedriveLeadNotesSyncButton,
  SaleAutomationActivity,
  SaleCallButton,
  SaleDeleteModal,
  SaleDetailAIWorkspace,
  SaleDiscoveryPanel,
  SaleStageControl,
} from "@/components/crm-boilerplate/LazySalesDetailPanels";
import type { SaleDiscoveryPack } from "@/components/crm-boilerplate/SaleDiscoveryPanel";
import type {
  SaleStageControlOption,
  SaleStageGatePreview,
} from "@/components/crm-boilerplate/SaleStageControl";
import SalesPipelineStageBadge from "@/components/crm-boilerplate/SalesPipelineStageBadge";
import {
  SalesSourceJourney,
  sourceJourneyKindFromText,
  type SourceJourneyItem,
} from "@/components/crm-boilerplate/SalesSourceJourney";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { ChevronLeftIcon, UserIcon } from "@/icons";
import { salesLeadAssistantResultSchema } from "@/lib/ai/sales-lead-assistant";
import {
  calculateAttributionConfidence,
  type AttributionConfidenceResult,
} from "@/lib/marketing/attribution-confidence";
import { getCurrentUser, requireUser } from "@/lib/auth";
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
} from "@/lib/contact-methods";
import { salesOpportunityIdAccessWhere } from "@/lib/crm-resource-access";
import { listRecordCustomerDocumentShares } from "@/lib/customer-document-share-list";
import { listRecordCustomerDocumentPortals } from "@/lib/customer-document-portal-list";
import { listRecordCustomerUploadRequests } from "@/lib/customer-upload-request-list";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayMoney,
  parseDisplayDefaults,
  type DisplayFormattingContext,
} from "@/lib/display-defaults";
import { parseDocumentLibrarySettings } from "@/lib/document-library";
import { latestEmailReplyText, toEmailPlainText } from "@/lib/email/plain-text";
import { pipedriveProvider } from "@/lib/integrations/pipedrive";
import { prisma } from "@/lib/prisma";
import { evaluateStageGate } from "@/lib/sales/stage-gates";
import { getCrmSettings } from "@/lib/settings";
import { listRecordSignatureRequests } from "@/lib/signature-request-list";
import { mediaAssetUrl } from "@/lib/storage/media";
import { cloudflareR2Provider, r2StoredConfigSchema } from "@/lib/storage/r2";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";

type SalePageProps = {
  params: Promise<{ id: string }>;
};

type SalesDocumentUploadRequestSummary = Awaited<
  ReturnType<typeof listRecordCustomerUploadRequests>
>[number];
type SalesDocumentShareSummary = Awaited<
  ReturnType<typeof listRecordCustomerDocumentShares>
>[number];
type SalesDocumentPortalSummary = Awaited<
  ReturnType<typeof listRecordCustomerDocumentPortals>
>[number];
type SalesSignatureRequestSummary = Awaited<
  ReturnType<typeof listRecordSignatureRequests>
>[number];

const initialConversationLimit = 40;
const pipedriveDealExternalType = "deal";
const pipedriveLeadExternalType = "lead";
const salesOpportunityExternalType = "salesOpportunity";

async function isPipedriveDealOpportunity(internalId: string) {
  const link = await prisma.externalRecordLink.findFirst({
    where: {
      externalType: pipedriveDealExternalType,
      internalId,
      internalType: salesOpportunityExternalType,
      provider: pipedriveProvider,
    },
    select: { id: true },
  });

  return Boolean(link);
}

export async function generateMetadata({
  params,
}: SalePageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return { title: "Opportunity | Sales" };
  }

  if (await isPipedriveDealOpportunity(id)) {
    return { title: "Opportunity | Sales" };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(id, user),
    select: { title: true },
  });

  return {
    title: sale ? `${sale.title} | Sales` : "Opportunity | Sales",
  };
}

function formatMoney(
  valueCents: number,
  currency: string,
  formatting: DisplayFormattingContext,
) {
  return formatDisplayMoney(valueCents, currency, formatting);
}

function formatDate(date: Date | null, formatting: DisplayFormattingContext) {
  return formatDisplayDate(date, formatting);
}

function formatDateTime(
  date: Date | null,
  formatting: DisplayFormattingContext,
) {
  return formatDisplayDateTime(date, formatting);
}

function compactAddress(
  entity:
    | {
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        county: string | null;
        postcode: string | null;
        country: string | null;
      }
    | null
    | undefined,
) {
  if (!entity) return null;

  return [
    entity.addressLine1,
    entity.addressLine2,
    entity.city,
    entity.county,
    entity.postcode,
    entity.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
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

function contactName(contact: { firstName: string; lastName: string } | null) {
  if (!contact) return "";

  return `${contact.firstName} ${contact.lastName}`.trim();
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function discoveryOptionValues(value: unknown) {
  const record = jsonObject(value);
  const rawOptions = Array.isArray(value)
    ? value
    : Array.isArray(record.options)
      ? record.options
      : Array.isArray(record.values)
        ? record.values
        : [];

  return rawOptions
    .map((option) => {
      if (typeof option === "string" || typeof option === "number") {
        return String(option);
      }

      const optionRecord = jsonObject(option);
      return (
        stringValue(optionRecord.label) ||
        stringValue(optionRecord.value) ||
        stringValue(optionRecord.name)
      );
    })
    .filter((option): option is string => Boolean(option));
}

function discoveryAnswerText(value: unknown) {
  if (value === null || typeof value === "undefined") return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(String).join(", ");

  return null;
}

function discoveryQuestionOptions({
  answerType,
  categoryOptions,
  options,
  productOptions,
}: {
  answerType: string;
  categoryOptions: Array<{ label: string; value: string }>;
  options: unknown;
  productOptions: Array<{ label: string; value: string }>;
}) {
  if (
    answerType === "PRODUCT_SELECT" ||
    answerType === "PRODUCT_MULTI_SELECT"
  ) {
    return productOptions;
  }

  if (
    answerType === "CATEGORY_SELECT" ||
    answerType === "CATEGORY_MULTI_SELECT"
  ) {
    return categoryOptions;
  }

  return discoveryOptionValues(options).map((option) => ({
    label: option,
    value: option,
  }));
}

function discoveryAnswerDisplay(
  question: SaleDiscoveryPack["questions"][number],
) {
  if (!question.answerValue?.trim()) return "Not answered";

  if (
    question.answerType === "PRODUCT_MULTI_SELECT" ||
    question.answerType === "CATEGORY_MULTI_SELECT" ||
    question.answerType === "MULTI_SELECT"
  ) {
    const optionByValue = new Map(
      question.options.map((option) => [option.value, option.label]),
    );

    return question.answerValue
      .split(",")
      .map((value) => optionByValue.get(value.trim()) ?? value.trim())
      .filter(Boolean)
      .join(", ");
  }

  if (
    question.answerType === "PRODUCT_SELECT" ||
    question.answerType === "CATEGORY_SELECT" ||
    question.answerType === "SINGLE_SELECT"
  ) {
    return (
      question.options.find((option) => option.value === question.answerValue)
        ?.label ?? question.answerValue
    );
  }

  return question.answerValue;
}

function LeadDiscoverySummary({ pack }: { pack: SaleDiscoveryPack | null }) {
  if (!pack) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Lead discovery
        </h2>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Add a lead-level Discovery pack to capture products, budget and
          timescale in one reusable place.
        </p>
      </section>
    );
  }

  const answered = pack.questions.filter((question) =>
    question.answerValue?.trim(),
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Lead discovery
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Products, budget and timescale are managed from the Discovery tab.
          </p>
        </div>
        <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
          {answered.length}/{pack.questions.length}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {pack.questions.map((question) => (
          <div
            key={question.id}
            className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950/40"
          >
            <dt className="truncate text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              {question.label}
            </dt>
            <dd className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">
              {discoveryAnswerDisplay(question)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LeadDocumentSummary({
  documentCount,
  documentPortals,
  documentShares,
  signatureRequests,
  uploadRequests,
}: {
  documentCount: number;
  documentPortals: SalesDocumentPortalSummary[];
  documentShares: SalesDocumentShareSummary[];
  signatureRequests: SalesSignatureRequestSummary[];
  uploadRequests: SalesDocumentUploadRequestSummary[];
}) {
  const requestedItemCount = uploadRequests.reduce(
    (total, request) => total + request.itemCount,
    0,
  );
  const completedItemCount = uploadRequests.reduce(
    (total, request) => total + request.completedItemCount,
    0,
  );
  const sentDocumentCount = documentShares.reduce(
    (total, share) => total + share.fileCount,
    0,
  );
  const downloadCount = documentShares.reduce(
    (total, share) => total + share.downloadCount,
    0,
  );
  const now = Date.now();
  const activePortalCount = documentPortals.filter(
    (portal) =>
      portal.status === "OPEN" &&
      !portal.revokedAt &&
      new Date(portal.expiresAt).getTime() > now,
  ).length;
  const completedSignatureCount = signatureRequests.filter(
    (request) => request.status === "COMPLETED",
  ).length;
  const pendingSignatureCount = signatureRequests.filter((request) =>
    ["DRAFT", "SENT", "DELIVERED"].includes(request.status),
  ).length;
  const summaryItems = [
    {
      label: "Stored documents",
      value: documentCount.toLocaleString("en-GB"),
      detail: "On this lead",
    },
    {
      label: "Requested uploads",
      value: `${completedItemCount}/${requestedItemCount}`,
      detail: requestedItemCount ? "Checklist progress" : "No requests",
    },
    {
      label: "Sent documents",
      value: sentDocumentCount.toLocaleString("en-GB"),
      detail: `${downloadCount.toLocaleString("en-GB")} downloads`,
    },
    {
      label: "Signatures",
      value: pendingSignatureCount.toLocaleString("en-GB"),
      detail: `${completedSignatureCount.toLocaleString("en-GB")} completed`,
    },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Document summary
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Current document activity for this lead.
          </p>
        </div>
        <StatusBadge>
          {activePortalCount ? "Active" : "Not Connected"}
        </StatusBadge>
      </div>
      <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950/40"
          >
            <dt className="truncate text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              {item.label}
            </dt>
            <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {item.value}
            </dd>
            <dd className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {item.detail}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function cachedSalesLeadGuidance(value: unknown) {
  const parsed = salesLeadAssistantResultSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

function touchParams(touch: unknown) {
  return jsonObject(jsonObject(touch).params);
}

function touchLabel(touch: unknown) {
  const params = touchParams(touch);
  const source = stringValue(params.utm_source);
  const medium = stringValue(params.utm_medium);
  const campaign = stringValue(params.utm_campaign);

  return [source, medium, campaign].filter(Boolean).join(" / ") || "Unknown";
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
    stringValue(data.currentPage)
  );
}

function touchSourceBadges(touch: unknown) {
  const params = touchParams(touch);
  const badges = new Set<string>();

  if (
    stringValue(params.gclid) ||
    stringValue(params.gbraid) ||
    stringValue(params.wbraid)
  ) {
    badges.add("Google Ads");
  }

  if (stringValue(params.msclkid)) {
    badges.add("Bing Ads");
  }

  if (stringValue(params.fbclid)) {
    badges.add("Meta");
  }

  sourceBadgesFromText(touchLabel(touch)).forEach((badge) => badges.add(badge));

  return Array.from(badges);
}

function sourceBadgesFromText(label: string | null) {
  const source = label?.toLowerCase() ?? "";
  const badges = new Set<string>();

  if (source.includes("google") || source.includes("adwords")) {
    badges.add("Google Ads");
  }

  if (source.includes("bing") || source.includes("microsoft")) {
    badges.add("Bing Ads");
  }

  if (
    source.includes("meta") ||
    source.includes("facebook") ||
    source.includes("instagram")
  ) {
    badges.add("Meta");
  }

  if (source.includes("youtube")) badges.add("YouTube");
  if (source.includes("linkedin")) badges.add("LinkedIn");
  if (source.includes("friend") || source.includes("referral")) {
    badges.add("Referral");
  }

  return Array.from(badges);
}

function sourceBadgeClasses(label: string) {
  if (label === "Google Ads") {
    return "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:ring-blue-800";
  }

  if (label === "Bing Ads") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:ring-emerald-800";
  }

  if (label === "Meta") {
    return "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/20 dark:text-sky-200 dark:ring-sky-800";
  }

  if (label === "YouTube") {
    return "bg-error-50 text-error-700 ring-error-200 dark:bg-error-900/20 dark:text-error-200 dark:ring-error-800";
  }

  if (label === "Referral") {
    return "bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-900/20 dark:text-warning-200 dark:ring-warning-800";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800";
}

function SourceBadge({
  className = "",
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset ${sourceBadgeClasses(
        label,
      )} ${className}`}
    >
      <AttributionSourceIconSlot
        className="size-4"
        fallbackKind={sourceJourneyKindFromText(label)}
        iconClassName="block h-3.5 w-3.5"
        label={label}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function attributionFromValue(value: unknown) {
  const attribution = jsonObject(value);
  const firstTouch = attribution.firstTouch;
  const lastTouch = attribution.lastTouch;
  const metadata = jsonObject(attribution.metadata);
  const sourceMetadata = jsonObject(attribution.sourceMetadata);

  return {
    firstTouch,
    lastTouch,
    landingPage:
      stringValue(attribution.landingPage) ||
      stringValue(jsonObject(firstTouch).landingPage) ||
      stringValue(jsonObject(firstTouch).url),
    currentPage:
      stringValue(attribution.currentPage) ||
      stringValue(jsonObject(lastTouch).url),
    referrer:
      stringValue(attribution.referrer) ||
      stringValue(jsonObject(lastTouch).referrer),
    visitorId: stringValue(attribution.visitorId),
    sessionId: stringValue(attribution.sessionId),
    submittedSource:
      stringValue(sourceMetadata.source) ||
      stringValue(metadata.source) ||
      stringValue(attribution.source),
  };
}

function sourceLabelFromAttribution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const attribution = value as Record<string, unknown>;
  const metadata = jsonObject(attribution.metadata);
  const sourceMetadata = jsonObject(attribution.sourceMetadata);
  const firstTouch = jsonObject(attribution.firstTouch);
  const firstParams = jsonObject(firstTouch.params);
  const source =
    sourceMetadata.source ||
    metadata.source ||
    attribution.source ||
    firstParams.utm_source ||
    firstTouch.source;

  return typeof source === "string" && source.trim() ? source.trim() : null;
}

function leadSourceDetail(touch: unknown) {
  const data = jsonObject(touch);
  const params = jsonObject(data.params);
  const medium = stringValue(params.utm_medium) || stringValue(data.medium);
  const campaign =
    stringValue(params.utm_campaign) ||
    stringValue(data.campaign) ||
    stringValue(data.campaignName);

  return [medium, campaign].filter(Boolean).join(" / ") || undefined;
}

function leadSourceLabelFromTouch(touch: unknown) {
  const data = jsonObject(touch);
  const params = jsonObject(data.params);

  return (
    stringValue(params.utm_source) ||
    stringValue(params.source) ||
    stringValue(data.source) ||
    stringValue(data.referrerHost) ||
    stringValue(data.referrer) ||
    stringValue(data.landingPage) ||
    stringValue(data.url)
  );
}

function leadSourceTouchpoints(value: unknown) {
  const attribution = jsonObject(value);
  const touchpoints: unknown[] = [];

  if (Object.keys(jsonObject(attribution.firstTouch)).length > 0) {
    touchpoints.push(attribution.firstTouch);
  }

  timelineItems(attribution.timeline).forEach((touchpoint) =>
    touchpoints.push(touchpoint),
  );

  if (Object.keys(jsonObject(attribution.lastTouch)).length > 0) {
    touchpoints.push(attribution.lastTouch);
  }

  return touchpoints.map((touchpoint) => ({
    label: leadSourceLabelFromTouch(touchpoint),
    detail: leadSourceDetail(touchpoint),
  }));
}

function cleanLeadSourceLabel(label: string | null | undefined) {
  const value = label?.trim();
  if (!value) return null;

  const normalised = value.toLowerCase();
  const mediumOnlyPattern =
    /^(cpc|ppc|paid|paid search|organic|organic search|social|display|email|sms|phone|call)\s*\//;
  const contactMethods = new Set([
    "call",
    "phone",
    "phone call",
    "inbound phone",
    "outbound phone",
    "email",
    "sms",
    "whatsapp",
  ]);

  if (contactMethods.has(normalised)) return null;
  if (mediumOnlyPattern.test(normalised)) return null;
  if (normalised === "google" || normalised === "google ads")
    return "Google Ads";
  if (normalised === "bing" || normalised === "microsoft ads")
    return "Bing Ads";
  if (
    normalised === "facebook" ||
    normalised === "instagram" ||
    normalised === "meta" ||
    normalised === "meta ads"
  ) {
    return "Meta";
  }

  return value;
}

function attributionHealthClasses(level: AttributionConfidenceResult["level"]) {
  if (level === "High") {
    return "bg-success-50 text-success-700 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40";
  }

  if (level === "Medium") {
    return "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/20 dark:text-brand-300 dark:ring-brand-900/40";
  }

  if (level === "Low") {
    return "bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-900/20 dark:text-warning-300 dark:ring-warning-900/40";
  }

  return "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:ring-gray-800";
}

function attributionHealthSummary(confidence: AttributionConfidenceResult) {
  const missing = confidence.missingFactors
    .filter((factor) => factor.key !== "consent")
    .slice(0, 2)
    .map((factor) => factor.label.toLowerCase());

  if (!missing.length) return "Evidence complete";

  return `Missing ${missing.join(", ")}`;
}

type AttributionJourneyEvent = {
  id: string;
  title: string;
  detail: string;
  occurredAt: Date;
  badges: string[];
  meta: string;
};

type JourneySalesOpportunity = {
  id: string;
  title: string;
  stage: string;
  salesPipelineStage: {
    name: string;
  } | null;
  source: string | null;
  attribution: unknown;
  createdAt: Date;
  updatedAt: Date;
  communications: Array<{
    id: string;
    channel: string;
    direction: string;
    subject: string | null;
    summary: string;
    occurredAt: Date;
  }>;
};

type JourneyAttributionRecord = {
  id: string;
  source: string;
  createdAt: Date;
  firstTouch: unknown;
  lastTouch: unknown;
  timeline: unknown;
  landingPage: string | null;
  currentPage: string | null;
  referrer: string | null;
  visitorId: string | null;
  sessionId: string | null;
  trackingPhoneNumber: string | null;
  opportunityId: string | null;
  callLogId: string | null;
  trackingNumber?: { phoneNumber: string; label: string | null } | null;
  touchpoints: JourneyAttributionTouchpoint[];
};

type JourneyAttributionTouchpoint = {
  id: string;
  role: string;
  position: number;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  url: string | null;
  landingPage: string | null;
  referrer: string | null;
  capturedAt: Date | null;
  createdAt: Date;
};

type JourneyCallLog = {
  id: string;
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: Date;
  attribution: unknown;
};

function isValidDate(date: Date | null | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime());
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

function addJourneyEvent(
  events: AttributionJourneyEvent[],
  event: AttributionJourneyEvent,
) {
  if (!isValidDate(event.occurredAt)) return;

  events.push({
    ...event,
    badges: Array.from(new Set(event.badges)).slice(0, 4),
  });
}

function addTouchEvent({
  events,
  id,
  title,
  touch,
  fallbackDate,
}: {
  events: AttributionJourneyEvent[];
  id: string;
  title: string;
  touch: unknown;
  fallbackDate?: Date;
}) {
  const occurredAt = touchDate(touch) ?? fallbackDate ?? null;
  if (!isValidDate(occurredAt)) return;

  const label = touchLabel(touch);
  const url = touchUrl(touch);

  addJourneyEvent(events, {
    id,
    title,
    detail: url || label,
    occurredAt,
    badges: touchSourceBadges(touch),
    meta: label,
  });
}

function dedupeJourneyEvents(events: AttributionJourneyEvent[]) {
  const seen = new Set<string>();

  return events.filter((event) => {
    const key = [
      event.title,
      event.detail,
      event.occurredAt.toISOString(),
      event.meta,
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildAttributionJourney({
  sale,
  attributionRecords,
  saleCalls,
}: {
  sale: JourneySalesOpportunity;
  attributionRecords: JourneyAttributionRecord[];
  saleCalls: JourneyCallLog[];
}) {
  const events: AttributionJourneyEvent[] = [];

  addJourneyEvent(events, {
    id: `sale-${sale.id}-created`,
    title: "Lead created",
    detail: sale.source ? `Source: ${sale.source}` : "Created in CRM",
    occurredAt: sale.createdAt,
    badges: sourceBadgesFromText(sale.source),
    meta: "CRM",
  });

  attributionTouchpoints(sale.attribution).forEach((touch, index) => {
    addTouchEvent({
      events,
      id: `sale-${sale.id}-touch-${index}`,
      title: index === 0 ? "First marketing touch" : "Marketing touch",
      touch,
      fallbackDate: sale.createdAt,
    });
  });

  attributionRecords.forEach((record) => {
    const recordLabel = formatEnumLabel(record.source);
    const recordAttribution = {
      firstTouch: record.firstTouch,
      lastTouch: record.lastTouch,
      timeline: record.timeline,
    };
    const number =
      record.trackingPhoneNumber || record.trackingNumber?.phoneNumber;
    const detail = [
      record.landingPage || record.currentPage,
      number ? `Number: ${number}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    attributionTouchpoints(recordAttribution).forEach((touch, index) => {
      addTouchEvent({
        events,
        id: `record-${record.id}-touch-${index}`,
        title: index === 0 ? "Captured first touch" : "Captured touch",
        touch,
        fallbackDate: record.createdAt,
      });
    });

    addJourneyEvent(events, {
      id: `record-${record.id}`,
      title:
        record.source === "PHONE"
          ? "Tracked call captured"
          : record.source === "FORM"
            ? "Form lead captured"
            : "Attribution record captured",
      detail: detail || recordLabel,
      occurredAt: record.createdAt,
      badges: sourceBadgesFromText(detail || recordLabel),
      meta: recordLabel,
    });
  });

  saleCalls.forEach((call) => {
    attributionTouchpoints(call.attribution).forEach((touch, index) => {
      addTouchEvent({
        events,
        id: `call-${call.id}-touch-${index}`,
        title: "Call attribution touch",
        touch,
        fallbackDate: call.startedAt,
      });
    });

    addJourneyEvent(events, {
      id: `call-${call.id}`,
      title: "Phone call",
      detail: `${call.fromNumber || "Unknown"} -> ${call.toNumber || "CRM"}`,
      occurredAt: call.startedAt,
      badges: sourceBadgesFromText(
        touchLabel(jsonObject(call.attribution).lastTouch),
      ),
      meta: formatEnumLabel(call.status),
    });
  });

  sale.communications.slice(0, 8).forEach((communication) => {
    addJourneyEvent(events, {
      id: `communication-${communication.id}`,
      title: `${formatEnumLabel(communication.channel)} ${formatEnumLabel(
        communication.direction,
      )}`,
      detail: communication.subject || communication.summary,
      occurredAt: communication.occurredAt,
      badges: sourceBadgesFromText(communication.channel),
      meta: "Sales activity",
    });
  });

  if (sale.stage !== "LEAD") {
    addJourneyEvent(events, {
      id: `sale-${sale.id}-stage`,
      title: `${sale.salesPipelineStage?.name ?? formatEnumLabel(sale.stage)} stage`,
      detail: "Current lifecycle stage",
      occurredAt: sale.updatedAt,
      badges: [],
      meta: "Sales stage",
    });
  }

  return dedupeJourneyEvents(events)
    .sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    )
    .slice(-14);
}

function websitePageDetail(
  value: Pick<JourneyAttributionTouchpoint, "url" | "landingPage" | "referrer">,
) {
  return (
    value.url || value.landingPage || value.referrer || "Website page viewed"
  );
}

function websiteSourceLabel(
  value: Pick<
    JourneyAttributionTouchpoint,
    "role" | "source" | "medium" | "campaign"
  >,
) {
  return (
    [value.source, value.medium, value.campaign].filter(Boolean).join(" / ") ||
    formatEnumLabel(value.role)
  );
}

function buildWebsiteConversationItems({
  attributionRecords,
  contactName,
  sale,
}: {
  attributionRecords: JourneyAttributionRecord[];
  contactName: string;
  sale: JourneySalesOpportunity;
}) {
  const saleAttributionItems = attributionTouchpoints(sale.attribution).map(
    (touch, index) => {
      const occurredAt = touchDate(touch) ?? sale.createdAt;
      const detail = touchUrl(touch) || "Website page viewed";
      const sourceLabel = touchLabel(touch);

      return {
        id: `website-sale-${sale.id}-${index}`,
        channel: "WEBSITE",
        direction: "INTERNAL",
        subject: index === 0 ? "Landed on website" : "Visited website page",
        summary: sourceLabel ? `${detail} · ${sourceLabel}` : detail,
        body: detail,
        fromAddress: null,
        toAddress: null,
        occurredAt: occurredAt.toISOString(),
        userName: null,
        contactName: contactName || null,
        metadata: {
          status: sourceLabel,
          attributionSource: "lead",
        },
      };
    },
  );

  const recordAttributionItems = attributionRecords.flatMap((record) => {
    const recordAttribution = {
      firstTouch: record.firstTouch,
      lastTouch: record.lastTouch,
      timeline: record.timeline,
    };
    const touchpoints = record.touchpoints.length
      ? record.touchpoints
      : attributionTouchpoints(recordAttribution).length
        ? attributionTouchpoints(recordAttribution).map((touch, index) => ({
            id: `${record.id}-json-${index}`,
            role: index === 0 ? "FIRST" : "ASSISTED",
            position: index,
            source: null,
            medium: null,
            campaign: null,
            url: touchUrl(touch),
            landingPage: null,
            referrer: null,
            capturedAt: touchDate(touch),
            createdAt: record.createdAt,
          }))
        : record.landingPage || record.currentPage || record.referrer
          ? [
              {
                id: `${record.id}-page`,
                role: "LAST",
                position: 0,
                source: null,
                medium: null,
                campaign: null,
                url: record.currentPage,
                landingPage: record.landingPage,
                referrer: record.referrer,
                capturedAt: record.createdAt,
                createdAt: record.createdAt,
              },
            ]
          : [];

    return touchpoints.map((touchpoint, index) => {
      const occurredAt =
        touchpoint.capturedAt ?? touchpoint.createdAt ?? record.createdAt;
      const title =
        touchpoint.role === "FIRST" || index === 0
          ? "Landed on website"
          : "Visited website page";
      const detail = websitePageDetail(touchpoint);
      const sourceLabel = websiteSourceLabel(touchpoint);

      return {
        id: `website-${record.id}-${touchpoint.id}`,
        channel: "WEBSITE",
        direction: "INTERNAL",
        subject: title,
        summary: sourceLabel ? `${detail} · ${sourceLabel}` : detail,
        body: detail,
        fromAddress: null,
        toAddress: null,
        occurredAt: occurredAt.toISOString(),
        userName: null,
        contactName: contactName || null,
        metadata: {
          status: sourceLabel,
          attributionRecordId: record.id,
          visitorId: record.visitorId,
          sessionId: record.sessionId,
        },
      };
    });
  });

  return [...saleAttributionItems, ...recordAttributionItems].filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.subject === item.subject &&
          candidate.body === item.body &&
          candidate.occurredAt === item.occurredAt,
      ) === index,
  );
}

function journeyDayLabel(date: Date, formatting: DisplayFormattingContext) {
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  const dayDelta = Math.round((todayStart - dateStart) / 86_400_000);

  if (dayDelta === 0) return "Today";
  if (dayDelta === 1) return "Yesterday";

  return formatDate(date, formatting);
}

function AttributionJourneyPanel({
  displayFormatting,
  events,
  sourceBadges,
  totalValue,
  currency,
}: {
  displayFormatting: DisplayFormattingContext;
  events: AttributionJourneyEvent[];
  sourceBadges: string[];
  totalValue: number;
  currency: string;
}) {
  const groupedEvents = events.reduce<
    Array<{ label: string; events: AttributionJourneyEvent[] }>
  >((groups, event) => {
    const label = journeyDayLabel(event.occurredAt, displayFormatting);
    const existing = groups.find((group) => group.label === label);

    if (existing) {
      existing.events.push(event);
      return groups;
    }

    groups.push({ label, events: [event] });
    return groups;
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Attribution journey
            </h2>
            <LazyHelpTooltip content="Shows the lead journey across marketing touches, tracking records, calls and sales activity in chronological order." />
          </div>
          {sourceBadges.length ? (
            <div className="flex max-w-full flex-wrap items-center gap-2">
              {sourceBadges.map((badge) => (
                <SourceBadge key={badge} className="h-7" label={badge} />
              ))}
            </div>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="min-w-0 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
              Value
            </dt>
            <dd className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-white/90">
              {formatMoney(totalValue, currency, displayFormatting)}
            </dd>
          </div>
          <div className="min-w-0 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
              Events
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
              {events.length}
            </dd>
          </div>
          <div className="min-w-0 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
              Sources
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
              {sourceBadges.length || "Not captured"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="px-5 py-5">
        {groupedEvents.length ? (
          <div className="space-y-5">
            {groupedEvents.map((group) => (
              <div key={group.label} className="min-w-0">
                <p className="mb-3 text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                  {group.label}
                </p>
                <div className="space-y-3">
                  {group.events.map((event) => (
                    <div key={event.id} className="flex min-w-0 gap-3">
                      <span className="mt-2 flex h-3 w-3 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-50 dark:ring-brand-900/30" />
                      <div className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-3 dark:border-gray-800">
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                            {event.title}
                          </p>
                          <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                            {formatDateTime(
                              event.occurredAt,
                              displayFormatting,
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-5 break-words text-gray-600 dark:text-gray-300">
                          {event.detail}
                        </p>
                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                          <span className="inline-flex max-w-full items-center truncate rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                            {event.meta}
                          </span>
                          {event.badges.map((badge) => (
                            <SourceBadge
                              key={badge}
                              className="py-1"
                              label={badge}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            No attribution journey has been captured yet.
          </p>
        )}
      </div>
    </section>
  );
}

function journeySourceLabel(event: AttributionJourneyEvent) {
  const title = event.title.toLowerCase();
  const detail = event.detail.toLowerCase();
  const badge = event.badges[0] ?? null;

  if (title.includes("first marketing") || title.includes("marketing touch")) {
    return badge || "Marketing";
  }

  if (title.includes("form")) return "Website form";
  if (title.includes("tracked call") || title.includes("phone call")) {
    return "Phone call";
  }
  if (title.includes("email")) return "Email";
  if (title.includes("sms") || title.includes("whatsapp")) return "SMS";
  if (detail.includes("landing")) return "Landing page";
  if (detail.includes("http") || detail.includes("www.")) return "Website";

  return event.title;
}

function buildDetailSourceJourney({
  sale,
  attributionRecords,
  saleCalls,
}: {
  sale: JourneySalesOpportunity;
  attributionRecords: JourneyAttributionRecord[];
  saleCalls: JourneyCallLog[];
}) {
  const items: SourceJourneyItem[] = [];
  const seen = new Set<string>();
  const addItem = (label: string | null, detail?: string) => {
    const cleanLabel = cleanLeadSourceLabel(label);
    if (!cleanLabel) return;

    const key = `${sourceJourneyKindFromText(cleanLabel)}:${cleanLabel.toLowerCase()}`;
    if (seen.has(key)) return;

    seen.add(key);
    items.push({
      id: `${items.length}-${key}`,
      label: cleanLabel,
      detail,
      kind: sourceJourneyKindFromText(cleanLabel),
    });
  };

  addItem(sale.source || sourceLabelFromAttribution(sale.attribution));
  leadSourceTouchpoints(sale.attribution).forEach((touchpoint) => {
    addItem(touchpoint.label, touchpoint.detail);
  });

  attributionRecords.forEach((record) => {
    const recordAttribution = {
      firstTouch: record.firstTouch,
      lastTouch: record.lastTouch,
      timeline: record.timeline,
    };

    leadSourceTouchpoints(recordAttribution).forEach((touchpoint) => {
      addItem(touchpoint.label, touchpoint.detail);
    });
  });

  saleCalls.forEach((call) => {
    leadSourceTouchpoints(call.attribution).forEach((touchpoint) => {
      addItem(touchpoint.label, touchpoint.detail);
    });
  });

  return items.slice(0, 8);
}

function saleAttributionHealth({
  attributionRecords,
  primaryAttribution,
  sale,
}: {
  attributionRecords: JourneyAttributionRecord[];
  primaryAttribution: ReturnType<typeof attributionFromValue>;
  sale: {
    attribution: unknown;
    contactId: string | null;
    id: string;
    source: string | null;
  };
}) {
  const attribution = jsonObject(sale.attribution);
  const metadata = jsonObject(attribution.metadata);
  const sourceMetadata = jsonObject(attribution.sourceMetadata);
  const hasAttributionPayload = Object.keys(attribution).length > 0;

  return calculateAttributionConfidence({
    firstTouch: primaryAttribution.firstTouch,
    lastTouch: primaryAttribution.lastTouch,
    timeline: attribution.timeline ?? attributionRecords[0]?.timeline,
    landingPage: primaryAttribution.landingPage,
    currentPage: primaryAttribution.currentPage,
    referrer: primaryAttribution.referrer,
    attributionSource:
      stringValue(sourceMetadata.source) ||
      stringValue(metadata.source) ||
      stringValue(attribution.source) ||
      sale.source,
    attributionMedium:
      stringValue(sourceMetadata.medium) ||
      stringValue(metadata.medium) ||
      stringValue(attribution.medium),
    attributionCampaign:
      stringValue(sourceMetadata.campaign) ||
      stringValue(metadata.campaign) ||
      stringValue(attribution.campaign),
    recordsCount: attributionRecords.length + (hasAttributionPayload ? 1 : 0),
    matchedContactId: sale.contactId,
    matchedOpportunityId: sale.id,
  });
}

function LeadAttributionCard({
  items,
  contactMatchedAttributionCount,
  confidence,
}: {
  items: SourceJourneyItem[];
  contactMatchedAttributionCount: number;
  confidence: AttributionConfidenceResult;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Lead attribution
          </h2>
          <LazyHelpTooltip content="Lead source journey using captured attribution evidence. Contact methods are excluded so this matches the sales table view." />
        </div>
        <span
          title={confidence.clientSummary}
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${attributionHealthClasses(
            confidence.level,
          )}`}
        >
          {confidence.level}
        </span>
      </div>
      <div className="mt-3 hidden sm:block">
        <SalesSourceJourney items={items} variant="detail" />
      </div>
      <div className="mt-3 sm:hidden">
        <SalesSourceJourney items={items} compact />
      </div>
      <p className="mt-3 text-xs font-medium text-gray-500 dark:text-gray-400">
        {attributionHealthSummary(confidence)}
      </p>
      {contactMatchedAttributionCount > 0 ? (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
          {contactMatchedAttributionCount} contact-matched attribution record
          {contactMatchedAttributionCount === 1 ? "" : "s"} available for
          review.
        </p>
      ) : null}
    </section>
  );
}

export default async function SaleDetailPage({ params }: SalePageProps) {
  const { id } = await params;
  const user = await requireUser();

  if (await isPipedriveDealOpportunity(id)) {
    notFound();
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(id, user),
    select: {
      id: true,
      title: true,
      stage: true,
      salesPipelineStageId: true,
      valueCents: true,
      currency: true,
      source: true,
      nextStep: true,
      expectedCloseDate: true,
      contactId: true,
      companyId: true,
      attribution: true,
      score: true,
      scoreUpdatedAt: true,
      aiGuidance: true,
      stageChangedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { communications: true } },
      company: {
        select: {
          id: true,
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          county: true,
          postcode: true,
          country: true,
        },
      },
      contact: {
        select: {
          additionalEmails: {
            orderBy: { createdAt: "asc" },
            select: { email: true, id: true, label: true },
          },
          additionalPhones: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              label: true,
              phone: true,
              phoneNormalized: true,
            },
          },
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          county: true,
          postcode: true,
          country: true,
        },
      },
      owner: { select: { email: true, name: true } },
      salesPipelineStage: {
        select: {
          name: true,
          color: true,
          goal: true,
          slaDays: true,
          movementPolicy: true,
          gateMode: true,
        },
      },
      communications: {
        orderBy: { occurredAt: "desc" },
        take: initialConversationLimit,
        select: {
          id: true,
          channel: true,
          direction: true,
          subject: true,
          summary: true,
          body: true,
          fromAddress: true,
          toAddress: true,
          metadata: true,
          occurredAt: true,
          contact: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          user: {
            select: {
              name: true,
            },
          },
        },
      },
      scoreEvents: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          delta: true,
          scoreAfter: true,
          reason: true,
          source: true,
          createdAt: true,
        },
      },
      automationRuns: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          trigger: true,
          action: true,
          status: true,
          message: true,
          metadata: true,
          createdAt: true,
          rule: { select: { name: true } },
        },
      },
      products: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          product: {
            select: {
              id: true,
              name: true,
              categoryId: true,
              category: { select: { id: true, name: true } },
              categoryAssignments: {
                select: {
                  categoryId: true,
                  category: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
      discoveryAnswers: {
        select: {
          questionId: true,
          productId: true,
          categoryId: true,
          value: true,
        },
      },
    },
  });

  if (!sale) {
    notFound();
  }

  const attributionWhere = sale.contactId
    ? { OR: [{ opportunityId: id }, { contactId: sale.contactId }] }
    : { opportunityId: id };
  const callWhere = sale.contactId
    ? { OR: [{ opportunityId: id }, { contactId: sale.contactId }] }
    : { opportunityId: id };
  const documentWhere = {
    OR: [
      { entityType: "SalesOpportunity", entityId: id },
      ...(sale.contactId
        ? [{ entityType: "Contact", entityId: sale.contactId }]
        : []),
    ],
  };
  const noteWhere =
    sale.contactId || sale.companyId
      ? {
          OR: [
            ...(sale.contactId ? [{ contactId: sale.contactId }] : []),
            ...(sale.companyId ? [{ companyId: sale.companyId }] : []),
          ],
        }
      : { id: "__none__" };
  const [
    attributionRecords,
    saleCalls,
    pipelineStages,
    discoveryTemplates,
    settings,
    linkedDocuments,
    opportunityDocuments,
    opportunityUploadRequests,
    opportunityDocumentShares,
    opportunityDocumentPortals,
    opportunitySignatureRequests,
    linkedNotes,
    mentionMembers,
    pipedriveLeadLink,
    r2Integration,
  ] = await Promise.all([
    prisma.attributionRecord.findMany({
      where: attributionWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        trackingNumber: { select: { phoneNumber: true, label: true } },
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
    prisma.callLog.findMany({
      where: callWhere,
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        fromNumber: true,
        toNumber: true,
        startedAt: true,
        opportunityId: true,
        contactId: true,
        attribution: true,
      },
    }),
    prisma.salesPipelineStage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        bucket: true,
        color: true,
        gateMode: true,
        goal: true,
        slaDays: true,
        movementPolicy: true,
      },
    }),
    prisma.discoveryTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ scope: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        scope: true,
        products: { select: { productId: true } },
        categories: { select: { categoryId: true } },
        questions: {
          orderBy: { sortOrder: "asc" },
          select: {
            required: true,
            requirementRules: true,
            visibilityRules: true,
            question: {
              select: {
                id: true,
                label: true,
                helpText: true,
                answerType: true,
                answerMode: true,
                maxAnswers: true,
                defaultRequired: true,
                options: true,
                isActive: true,
              },
            },
          },
        },
      },
    }),
    getCrmSettings(),
    prisma.fileAsset.findMany({
      where: documentWhere,
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        uploadedBy: { select: { name: true, email: true } },
      },
    }),
    prisma.fileAsset.findMany({
      where: { entityId: id, entityType: "SalesOpportunity" },
      orderBy: { createdAt: "desc" },
      take: 120,
      include: {
        uploadedBy: { select: { name: true, email: true } },
      },
    }),
    listRecordCustomerUploadRequests({
      entityId: id,
      entityType: "SalesOpportunity",
    }),
    listRecordCustomerDocumentShares({
      entityId: id,
      entityType: "SalesOpportunity",
    }),
    listRecordCustomerDocumentPortals({
      entityId: id,
      entityType: "SalesOpportunity",
    }),
    listRecordSignatureRequests({
      entityId: id,
      entityType: "SalesOpportunity",
    }),
    prisma.note.findMany({
      where: noteWhere,
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        id: { not: user.id },
        status: "ACTIVE",
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        email: true,
        firstName: true,
        id: true,
        lastName: true,
        name: true,
      },
    }),
    prisma.externalRecordLink.findFirst({
      where: {
        externalType: pipedriveLeadExternalType,
        internalId: id,
        internalType: salesOpportunityExternalType,
        provider: pipedriveProvider,
      },
      select: { externalId: true },
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: cloudflareR2Provider },
      select: { config: true },
    }),
  ]);
  const discoveryAnswerTypes = new Set(
    discoveryTemplates.flatMap((template) =>
      template.questions.map((assignment) => assignment.question.answerType),
    ),
  );
  const needsProductOptions =
    discoveryAnswerTypes.has("PRODUCT_SELECT") ||
    discoveryAnswerTypes.has("PRODUCT_MULTI_SELECT");
  const needsCategoryOptions =
    discoveryAnswerTypes.has("CATEGORY_SELECT") ||
    discoveryAnswerTypes.has("CATEGORY_MULTI_SELECT");
  const [activeProducts, activeCategories] = await Promise.all([
    needsProductOptions
      ? prisma.product.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    needsCategoryOptions
      ? prisma.productCategory.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const displayDefaults = parseDisplayDefaults(settings.displayDefaults);
  const displayFormatting = { displayDefaults, workspaceDefaults };
  const stageOptions: SaleStageControlOption[] = pipelineStages.map(
    (stage) => ({
      id: stage.id,
      name: stage.name,
      bucket: stage.bucket,
      color: stage.color,
      gateMode: stage.gateMode,
      goal: stage.goal,
      slaDays: stage.slaDays,
      movementPolicy: stage.movementPolicy,
    }),
  );
  const stageGatePreviews: SaleStageGatePreview[] = await Promise.all(
    pipelineStages.map(async (stage) => {
      const gate = await evaluateStageGate({
        client: prisma,
        opportunityId: sale.id,
        salesPipelineStageId: stage.id,
      });

      return {
        mode: gate.mode,
        missing: gate.missing,
        passed: gate.passed,
        stageId: stage.id,
      };
    }),
  );

  const customerName = contactName(sale.contact);
  const contactAdditionalEmails = sale.contact
    ? normalizeContactEmailMethods(
        sale.contact.additionalEmails,
        sale.contact.email,
      )
    : [];
  const contactAdditionalPhones = sale.contact
    ? normalizeContactPhoneMethods(
        sale.contact.additionalPhones,
        sale.contact.phone,
      )
    : [];
  const contactEmail =
    sale.contact?.email ?? contactAdditionalEmails[0]?.email ?? null;
  const contactPhone =
    sale.contact?.phone ?? contactAdditionalPhones[0]?.phone ?? null;
  const attributedCalls = saleCalls.filter((call) => call.attribution);
  const directAttributionCount = attributionRecords.filter(
    (record) => record.opportunityId === sale.id,
  ).length;
  const contactMatchedAttributionCount =
    attributionRecords.length - directAttributionCount;
  const saleAttribution = attributionFromValue(sale.attribution);
  const latestAttributionRecord = attributionRecords[0] ?? null;
  const latestRecordAttribution = latestAttributionRecord
    ? {
        firstTouch: latestAttributionRecord.firstTouch,
        lastTouch: latestAttributionRecord.lastTouch,
        landingPage: latestAttributionRecord.landingPage,
        currentPage: latestAttributionRecord.currentPage,
        referrer: latestAttributionRecord.referrer,
        visitorId: latestAttributionRecord.visitorId,
        sessionId: latestAttributionRecord.sessionId,
        submittedSource: null,
      }
    : null;
  const primaryAttribution = latestRecordAttribution ?? saleAttribution;
  const firstTouch =
    primaryAttribution.firstTouch ?? saleAttribution.firstTouch;
  const lastTouch = primaryAttribution.lastTouch ?? saleAttribution.lastTouch;
  const trackingNumbers = Array.from(
    new Set(
      attributionRecords
        .map(
          (record) =>
            record.trackingPhoneNumber ||
            record.trackingNumber?.phoneNumber ||
            null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const attributionJourney = buildAttributionJourney({
    sale,
    attributionRecords,
    saleCalls,
  });
  const detailSourceJourney = buildDetailSourceJourney({
    sale,
    attributionRecords,
    saleCalls,
  });
  const attributionConfidence = saleAttributionHealth({
    attributionRecords,
    primaryAttribution,
    sale,
  });
  const communicationConversationItems = sale.communications.map(
    (communication) => {
      const body = toEmailPlainText(communication.body);

      return {
        id: communication.id,
        channel: communication.channel,
        direction: communication.direction,
        subject: communication.subject,
        summary: toEmailPlainText(communication.summary),
        body:
          (communication.channel === "EMAIL"
            ? latestEmailReplyText(body)
            : body) || null,
        fromAddress: communication.fromAddress,
        toAddress: communication.toAddress,
        occurredAt: communication.occurredAt.toISOString(),
        userName: communication.user?.name ?? null,
        contactName: contactName(communication.contact),
        metadata: communication.metadata,
      };
    },
  );
  const websiteConversationItems = buildWebsiteConversationItems({
    attributionRecords,
    contactName: customerName,
    sale,
  });
  const conversationItems = [
    ...communicationConversationItems,
    ...websiteConversationItems,
  ].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() -
      new Date(left.occurredAt).getTime(),
  );
  const conversationTotalCount =
    sale._count.communications + websiteConversationItems.length;
  const initialSalesLeadGuidance = cachedSalesLeadGuidance(sale.aiGuidance);
  const saleStageName =
    sale.salesPipelineStage?.name ?? formatEnumLabel(sale.stage);
  const saleStageColor =
    sale.salesPipelineStage?.color ??
    (sale.stage === "WON"
      ? "#12B76A"
      : sale.stage === "LOST"
        ? "#98A2B3"
        : sale.stage === "NEGOTIATION"
          ? "#7A5AF8"
          : sale.stage === "PROPOSAL"
            ? "#0BA5EC"
            : sale.stage === "QUALIFIED"
              ? "#F97316"
              : "#EF4444");
  const aiTargetStageName =
    initialSalesLeadGuidance?.stageRecommendation.targetStage?.trim();
  const aiTargetPipelineStage = aiTargetStageName
    ? stageOptions.find(
        (stage) =>
          stage.name.toLowerCase() === aiTargetStageName.toLowerCase() ||
          stage.bucket.toLowerCase() === aiTargetStageName.toLowerCase(),
      )
    : null;
  const opportunityProducts = sale.products.map((assignment) => ({
    id: assignment.product.id,
    name: assignment.product.name,
    categoryIds: Array.from(
      new Set(
        [
          assignment.product.categoryId,
          ...assignment.product.categoryAssignments.map(
            (categoryAssignment) => categoryAssignment.categoryId,
          ),
        ].filter((categoryId): categoryId is string => Boolean(categoryId)),
      ),
    ),
    categoryNames: Array.from(
      new Set(
        [
          assignment.product.category?.name,
          ...assignment.product.categoryAssignments.map(
            (categoryAssignment) => categoryAssignment.category.name,
          ),
        ].filter((categoryName): categoryName is string =>
          Boolean(categoryName),
        ),
      ),
    ),
  }));
  const technologies =
    opportunityProducts.map((product) => product.name).join(", ") ||
    "Not captured";
  const projectAddress =
    compactAddress(sale.contact) ||
    compactAddress(sale.company) ||
    "Not captured";
  const r2Config = r2StoredConfigSchema.safeParse(r2Integration?.config ?? {});
  const documentLibrary = parseDocumentLibrarySettings(
    settings.documentLibrary,
  );
  const documentUploadPolicy = {
    allowedMimeTypes: r2Config.success ? r2Config.data.allowedMimeTypes : "",
    isConfigured: Boolean(r2Config.success && r2Config.data.credentials),
    maxUploadMb: r2Config.success ? r2Config.data.maxUploadMb : 25,
  };
  const documents = linkedDocuments.map((document) => ({
    createdAt: formatDate(document.createdAt, displayFormatting),
    id: document.id,
    mimeType: document.mimeType,
    name: document.originalName,
    notes: document.notes,
    scope:
      document.entityType === "Contact"
        ? ("customer" as const)
        : ("lead" as const),
    sizeLabel: fileSizeLabel(document.sizeBytes),
    tags: document.tags,
    typeLabel: fileTypeLabel(document.mimeType),
    url: mediaAssetUrl(document.id),
    uploadedBy:
      document.uploadedBy?.name || document.uploadedBy?.email || "CRM user",
  }));
  const recordDocuments = opportunityDocuments.map((document) => ({
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
  const notes = [
    ...sale.communications
      .filter((communication) => communication.channel === "NOTE")
      .map((communication) => ({
        body: communication.body || communication.summary,
        createdAtDate: communication.occurredAt,
        id: communication.id,
        userName: communication.user?.name || "CRM user",
      })),
    ...linkedNotes.map((note) => ({
      body: note.body,
      createdAtDate: note.createdAt,
      id: note.id,
      userName: note.user.name || note.user.email,
    })),
  ]
    .sort(
      (left, right) =>
        right.createdAtDate.getTime() - left.createdAtDate.getTime(),
    )
    .slice(0, 6)
    .map((note) => ({
      body: note.body,
      createdAt: formatDate(note.createdAtDate, displayFormatting),
      id: note.id,
      userName: note.userName,
    }));
  const opportunityProductIds = new Set(
    opportunityProducts.map((product) => product.id),
  );
  const opportunityCategoryIds = new Set(
    opportunityProducts.flatMap((product) => product.categoryIds),
  );
  const answerByKey = new Map(
    sale.discoveryAnswers.map((answer) => [
      `${answer.questionId}:${answer.productId ?? "lead"}:${answer.categoryId ?? "lead"}`,
      discoveryAnswerText(answer.value),
    ]),
  );
  const productSelectOptions = activeProducts.map((product) => ({
    label: product.name,
    value: product.id,
  }));
  const categorySelectOptions = activeCategories.map((category) => ({
    label: category.name,
    value: category.id,
  }));
  const discoveryTemplateScopePriority = {
    LEAD: 0,
    PRODUCT: 1,
    CATEGORY: 2,
  } as const;
  const orderedDiscoveryTemplates = [...discoveryTemplates].sort(
    (left, right) => {
      const scopeDelta =
        discoveryTemplateScopePriority[left.scope] -
        discoveryTemplateScopePriority[right.scope];
      if (scopeDelta) return scopeDelta;
      if (left.slug === "lead-qualification") return -1;
      if (right.slug === "lead-qualification") return 1;
      return left.name.localeCompare(right.name);
    },
  );
  const discoveryQuestionRows = (
    template: (typeof discoveryTemplates)[number],
    context: { productId?: string | null; categoryId?: string | null },
  ) =>
    template.questions
      .filter((assignment) => assignment.question.isActive)
      .map((assignment) => ({
        id: assignment.question.id,
        label: assignment.question.label,
        helpText: assignment.question.helpText,
        answerType: assignment.question.answerType,
        answerMode: assignment.question.answerMode,
        maxAnswers: assignment.question.maxAnswers,
        required: assignment.required || assignment.question.defaultRequired,
        requirementRules: assignment.requirementRules,
        visibilityRules: assignment.visibilityRules,
        options: discoveryQuestionOptions({
          answerType: assignment.question.answerType,
          categoryOptions: categorySelectOptions,
          options: assignment.question.options,
          productOptions: productSelectOptions,
        }),
        answerValue:
          answerByKey.get(
            `${assignment.question.id}:${context.productId ?? "lead"}:${context.categoryId ?? "lead"}`,
          ) ?? null,
      }));
  const discoveryPacks: SaleDiscoveryPack[] = orderedDiscoveryTemplates.flatMap(
    (template): SaleDiscoveryPack[] => {
      if (!template.questions.length) return [];

      if (template.scope === "LEAD") {
        return [
          {
            id: `${template.id}:lead`,
            name: template.name,
            description: template.description,
            scope: "LEAD" as const,
            contextId: null,
            contextName: null,
            questions: discoveryQuestionRows(template, {}),
          },
        ];
      }

      if (template.scope === "PRODUCT") {
        const templateProductIds = template.products.map(
          (assignment) => assignment.productId,
        );
        const matchedProducts = opportunityProducts.filter((product) =>
          templateProductIds.length
            ? templateProductIds.includes(product.id)
            : opportunityProductIds.has(product.id),
        );

        return matchedProducts.map((product) => ({
          id: `${template.id}:product:${product.id}`,
          name: template.name,
          description: template.description,
          scope: "PRODUCT" as const,
          contextId: product.id,
          contextName: product.name,
          questions: discoveryQuestionRows(template, { productId: product.id }),
        }));
      }

      const templateCategoryIds = template.categories.map(
        (assignment) => assignment.categoryId,
      );
      const categories = new Map<string, string>();
      for (const product of opportunityProducts) {
        product.categoryIds.forEach((categoryId, index) => {
          if (
            templateCategoryIds.length &&
            !templateCategoryIds.includes(categoryId)
          ) {
            return;
          }
          categories.set(
            categoryId,
            product.categoryNames[index] ?? "Category discovery",
          );
        });
      }

      if (!templateCategoryIds.length && !opportunityCategoryIds.size) {
        return [];
      }

      return Array.from(categories.entries()).map(([categoryId, name]) => ({
        id: `${template.id}:category:${categoryId}`,
        name: template.name,
        description: template.description,
        scope: "CATEGORY" as const,
        contextId: categoryId,
        contextName: name,
        questions: discoveryQuestionRows(template, { categoryId }),
      }));
    },
  );
  const leadDiscoveryPack =
    discoveryPacks.find((pack) => pack.scope === "LEAD") ?? null;

  return (
    <>
      {pipedriveLeadLink ? (
        <PipedriveLeadNotesAutoSync saleId={sale.id} />
      ) : null}
      <section className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
          <Link
            href="/sales"
            className="inline-flex h-10 shrink-0 items-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Back to Sales
          </Link>
          <span className="hidden h-8 w-px shrink-0 bg-gray-200 lg:block dark:bg-gray-800" />
          <div className="min-w-0 lg:max-w-[460px] xl:max-w-[560px]">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-gray-900 dark:text-white">
                {sale.title}
              </h1>
              <LazyHelpTooltip content="Lead workspace for conversation, lead details and discovery." />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 lg:hidden dark:text-gray-400">
              <SalesPipelineStageBadge
                color={saleStageColor}
                label={saleStageName}
              />
              <span>{customerName || sale.company?.name || "No customer"}</span>
            </div>
          </div>
          <div className="hidden shrink-0 lg:block">
            <SalesPipelineStageBadge
              color={saleStageColor}
              label={saleStageName}
            />
          </div>
          <span className="hidden h-8 w-px shrink-0 bg-gray-200 lg:block dark:bg-gray-800" />
          <div className="hidden max-w-[220px] min-w-0 shrink-0 items-center gap-2 lg:flex">
            <UserIcon className="h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">
              {customerName || sale.company?.name || "No customer"}
            </span>
          </div>
          <span className="hidden h-8 w-px shrink-0 bg-gray-200 lg:block dark:bg-gray-800" />
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            {contactPhone ? (
              <SaleCallButton
                phone={contactPhone}
                contactName={customerName || contactPhone}
                saleTitle={sale.title}
                opportunityId={sale.id}
                contactId={sale.contactId}
              />
            ) : null}
            {primaryAttribution.visitorId ? (
              <Link
                href={`/marketing/visitors?q=${encodeURIComponent(primaryAttribution.visitorId)}`}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
              >
                Visitor evidence
              </Link>
            ) : null}
            {user.role === "ADMIN" && pipedriveLeadLink ? (
              <PipedriveLeadNotesSyncButton saleId={sale.id} />
            ) : null}
            {user.role === "ADMIN" ? (
              <SaleDeleteModal saleId={sale.id} saleTitle={sale.title} />
            ) : null}
          </div>
        </div>
      </section>

      <SaleDetailAIWorkspace
        initialResult={initialSalesLeadGuidance}
        saleId={sale.id}
        sale={{
          expectedCloseDate: formatDate(
            sale.expectedCloseDate,
            displayFormatting,
          ),
          leadStartDate: formatDate(sale.createdAt, displayFormatting),
          nextStep: sale.nextStep,
          ownerName: sale.owner?.name || sale.owner?.email || "Unassigned",
          projectAddress,
          projectType: "Not captured",
          source:
            sale.source || primaryAttribution.submittedSource || "Not captured",
          stage: sale.stage,
          technologies,
          title: sale.title,
          value: formatMoney(sale.valueCents, sale.currency, displayFormatting),
        }}
        communications={conversationItems}
        communicationsCount={conversationTotalCount}
        contactId={sale.contactId}
        documents={documents}
        documentUploadPolicy={documentUploadPolicy}
        automationPanel={
          <div className="p-4 sm:p-5">
            <SaleAutomationActivity
              aiRecommendation={
                initialSalesLeadGuidance
                  ? {
                      action:
                        initialSalesLeadGuidance.stageRecommendation.action,
                      generatedAt: initialSalesLeadGuidance.generatedAt,
                      rationale:
                        initialSalesLeadGuidance.stageRecommendation.rationale,
                      targetStageId: aiTargetPipelineStage?.id ?? null,
                      targetStage:
                        initialSalesLeadGuidance.stageRecommendation
                          .targetStage,
                      targetStageMovementPolicy:
                        aiTargetPipelineStage?.movementPolicy ?? null,
                    }
                  : null
              }
              automationRuns={sale.automationRuns.map((run) => ({
                action: run.action,
                createdAt: run.createdAt.toISOString(),
                id: run.id,
                metadata: jsonObject(run.metadata),
                message: run.message,
                ruleName: run.rule?.name ?? null,
                status: run.status,
                trigger: run.trigger,
              }))}
              saleId={sale.id}
              scoreEvents={sale.scoreEvents.map((event) => ({
                createdAt: event.createdAt.toISOString(),
                delta: event.delta,
                id: event.id,
                reason: event.reason,
                scoreAfter: event.scoreAfter,
                source: event.source,
              }))}
            />
          </div>
        }
        discoveryPanel={
          <SaleDiscoveryPanel packs={discoveryPacks} saleId={sale.id} />
        }
        recipientEmail={contactEmail}
        recipientName={customerName || contactPhone || "customer"}
        recipientPhone={contactPhone}
        notes={notes}
        mentionMembers={mentionMembers}
        documentsPanel={
          <div className="p-4 sm:p-5">
            <RecordDocumentLibrary
              documentPortals={opportunityDocumentPortals}
              documentShares={opportunityDocumentShares}
              documents={recordDocuments}
              entityId={sale.id}
              entityLabel={sale.title}
              entityType="SalesOpportunity"
              folders={documentLibrary.folders}
              signatureRequests={opportunitySignatureRequests}
              uploadRequests={opportunityUploadRequests}
              uploadPolicy={documentUploadPolicy}
            />
          </div>
        }
        scopePanel={
          <div className="p-4 sm:p-5">
            <section className="mb-5 border-b border-gray-200 pb-4 dark:border-gray-800">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                    Customer
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {customerName || sale.company?.name || "No customer"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                    Value
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {formatMoney(
                      sale.valueCents,
                      sale.currency,
                      displayFormatting,
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                    Expected close
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {formatDate(sale.expectedCloseDate, displayFormatting)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                    Products
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {opportunityProducts.length
                      ? opportunityProducts
                          .map((product) => product.name)
                          .join(", ")
                      : "Not assigned"}
                  </p>
                </div>
              </div>
              {sale.nextStep ? (
                <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-600 ring-1 ring-gray-100 dark:bg-white/[0.03] dark:text-gray-300 dark:ring-gray-800">
                  <span className="font-semibold text-gray-800 dark:text-white">
                    Next step:
                  </span>{" "}
                  {sale.nextStep}
                </div>
              ) : null}
            </section>
            <LeadDiscoverySummary pack={leadDiscoveryPack} />

            <LeadDocumentSummary
              documentCount={recordDocuments.length}
              documentPortals={opportunityDocumentPortals}
              documentShares={opportunityDocumentShares}
              signatureRequests={opportunitySignatureRequests}
              uploadRequests={opportunityUploadRequests}
            />

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <SaleStageControl
                  currentStageColor={saleStageColor}
                  currentStageId={sale.salesPipelineStageId}
                  currentStageName={saleStageName}
                  saleId={sale.id}
                  score={sale.score}
                  scoreUpdatedAt={sale.scoreUpdatedAt?.toISOString() ?? null}
                  stageAgeDays={Math.max(
                    0,
                    Math.floor(
                      (Date.now() - sale.stageChangedAt.getTime()) / 86_400_000,
                    ),
                  )}
                  stageGatePreviews={stageGatePreviews}
                  stageOptions={stageOptions}
                />

                <LeadAttributionCard
                  items={detailSourceJourney}
                  contactMatchedAttributionCount={
                    contactMatchedAttributionCount
                  }
                  confidence={attributionConfidence}
                />
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                        Customer
                      </h2>
                      <LazyHelpTooltip content="Shows the contact and company linked to this opportunity." />
                    </div>
                    {sale.contactId ? (
                      <Link
                        href={`/contacts/${sale.contactId}`}
                        className="inline-flex h-8 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                      >
                        <UserIcon className="h-4 w-4" />
                        View
                      </Link>
                    ) : null}
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Contact
                      </dt>
                      <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                        {sale.contactId ? (
                          <Link
                            href={`/contacts/${sale.contactId}`}
                            className="text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
                          >
                            {customerName || "No contact"}
                          </Link>
                        ) : (
                          customerName || "No contact"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Company
                      </dt>
                      <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                        {sale.company?.name ?? "Not linked"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Email
                      </dt>
                      <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                        {contactEmail ? (
                          <a
                            href={`mailto:${contactEmail}`}
                            className="break-all text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
                          >
                            {contactEmail}
                          </a>
                        ) : (
                          "Not set"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Phone
                      </dt>
                      <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                        {contactPhone ? (
                          <a
                            href={`tel:${contactPhone}`}
                            className="text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
                          >
                            {contactPhone}
                          </a>
                        ) : (
                          "Not set"
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                <details className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="text-base font-semibold text-gray-800 dark:text-white/90">
                        Attribution details
                      </span>
                      <LazyHelpTooltip content="Detailed attribution fields retained for review without dominating the sales workspace." />
                    </span>
                    <StatusBadge>
                      {attributionRecords.length || sale.attribution
                        ? "Active"
                        : "Not Connected"}
                    </StatusBadge>
                  </summary>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        First touch
                      </dt>
                      <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                        {firstTouch ? touchLabel(firstTouch) : "No first touch"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Last touch
                      </dt>
                      <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                        {lastTouch ? touchLabel(lastTouch) : "No last touch"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Landing page
                      </dt>
                      <dd className="mt-1 font-medium break-all text-gray-800 dark:text-white/90">
                        {primaryAttribution.landingPage || "Not captured"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Tracking number
                      </dt>
                      <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                        {trackingNumbers.join(", ") || "None"}
                      </dd>
                    </div>
                  </dl>
                </details>
              </div>
            </div>
          </div>
        }
      />
    </>
  );
}
