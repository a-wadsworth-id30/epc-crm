"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  CircleDollarSign,
  FileText,
  FolderOpen,
  GripVertical,
  Home,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  PackageCheck,
  ReceiptText,
  Settings2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { AILabel, AISparkIcon } from "@/components/crm-boilerplate/AITheme";
import CompactAIGuidanceRail from "@/components/crm-boilerplate/CompactAIGuidanceRail";
import FileDropzone from "@/components/crm-boilerplate/FileDropzone";
import FilePreviewButton from "@/components/crm-boilerplate/FilePreviewButton";
import RealtimePageRefresh from "@/components/crm-boilerplate/RealtimePageRefresh";
import SaleConversationThread, {
  type SaleConversationItem,
} from "@/components/crm-boilerplate/SaleConversationThread";
import { PhoneIcon } from "@/components/crm-boilerplate/SoftphoneIcons";
import {
  ChevronUpIcon,
  CloseIcon,
  DownloadIcon,
  FileIcon,
  MailIcon,
  PaperPlaneIcon,
} from "@/icons";
import {
  uploadSaleDocumentAction,
  type SaleDocumentActionState,
} from "@/lib/actions/sales-documents";
import { documentUploadTypeDefinitions } from "@/lib/document-library";
import { realtimeTopics } from "@/lib/realtime/topic-names";
import { triggerSoftphoneDial } from "@/lib/telephony/softphone-dial";

type ChannelKey = "email" | "sms" | "phone";
type ToneKey = "professional" | "friendly" | "direct";
type WorkspaceTabKey =
  | "automation"
  | "conversation"
  | "documents"
  | "lead"
  | "discovery";
type SidebarPanelKey = "ai" | "documents" | "notes";
type LeadMetricKey =
  | "expectedClose"
  | "leadStartDate"
  | "name"
  | "nextStep"
  | "owner"
  | "products"
  | "projectAddress"
  | "projectType"
  | "source"
  | "stage"
  | "technologies"
  | "value";

type SalesLeadAIResult = {
  summary: string;
  nextStep: {
    title: string;
    rationale: string;
    urgency: "low" | "medium" | "high";
    channel: "Email" | "SMS" | "Phone";
  };
  stageRecommendation: {
    action: "stay" | "consider_move" | "ready_to_move";
    targetStage: string | null;
    rationale: string;
  };
  insights: string[];
  risks: string[];
  drafts: {
    email: { subject: string; body: string };
    sms: string;
    phoneScript: string;
  };
  generatedAt: string;
  mode: "fallback" | "openai";
  model?: string;
};

type SaleDetailAIWorkspaceProps = {
  initialResult?: SalesLeadAIResult | null;
  saleId: string;
  sale: {
    expectedCloseDate: string;
    leadStartDate: string;
    nextStep: string | null;
    ownerName: string;
    projectAddress: string;
    projectType: string;
    source: string;
    stage: string;
    technologies: string;
    title: string;
    value: string;
  };
  communications: SaleConversationItem[];
  communicationsCount: number;
  contactId: string | null;
  automationPanel: React.ReactNode;
  documents: SaleDocument[];
  documentUploadPolicy: {
    allowedMimeTypes: string;
    isConfigured: boolean;
    maxUploadMb: number;
  };
  notes: SaleNote[];
  recipientEmail: string | null;
  recipientName: string;
  recipientPhone: string | null;
  documentsPanel: React.ReactNode;
  discoveryPanel: React.ReactNode;
  scopePanel: React.ReactNode;
};

type WorkspaceTab = {
  key: WorkspaceTabKey | "estimate" | "proposal";
  label: string;
  description: string;
  Icon: LucideIcon;
  disabled?: boolean;
};

type LeadMetric = {
  key: LeadMetricKey;
  label: string;
  value: string;
  Icon: LucideIcon;
};

type SaleDocument = {
  createdAt: string;
  id: string;
  mimeType: string;
  name: string;
  notes: string | null;
  scope: "customer" | "lead";
  sizeLabel: string;
  tags: string[];
  typeLabel: string;
  url: string;
  uploadedBy: string;
};

type SaleNote = {
  body: string;
  createdAt: string;
  id: string;
  userName: string;
};

const channels: Array<{ key: ChannelKey; label: string }> = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "phone", label: "Phone script" },
];

const tones: Array<{ key: ToneKey; label: string }> = [
  { key: "professional", label: "Professional" },
  { key: "friendly", label: "Friendly" },
  { key: "direct", label: "Direct" },
];

const workspaceTabs: WorkspaceTab[] = [
  {
    key: "conversation",
    label: "Conversation",
    description: "Calls, emails, SMS and website activity",
    Icon: MessageSquareText,
  },
  {
    key: "lead",
    label: "Lead Enquiry",
    description: "Customer, value, scope and next step",
    Icon: ClipboardList,
  },
  {
    key: "documents",
    label: "Documents",
    description: "Files, customer portals and signatures",
    Icon: FolderOpen,
  },
  {
    key: "discovery",
    label: "Discovery",
    description: "Lead, category and product questions",
    Icon: PackageCheck,
  },
  {
    key: "estimate",
    label: "Estimate",
    description: "Coming next",
    Icon: ReceiptText,
    disabled: true,
  },
  {
    key: "proposal",
    label: "Proposal",
    description: "Coming next",
    Icon: FileText,
    disabled: true,
  },
  {
    key: "automation",
    label: "Automation",
    description: "Score, AI guidance and automation runs",
    Icon: Activity,
  },
];

const sidebarPanels: Array<{ key: SidebarPanelKey; label: string }> = [
  { key: "notes", label: "Notes" },
  { key: "documents", label: "Documents" },
  { key: "ai", label: "Sales AI" },
];

const defaultMetricKeys: LeadMetricKey[] = [
  "name",
  "projectAddress",
  "technologies",
  "projectType",
  "leadStartDate",
];

const leadMetricLabels: Record<LeadMetricKey, string> = {
  expectedClose: "Expected close",
  leadStartDate: "Lead start date",
  name: "Name",
  nextStep: "Next step",
  owner: "Owner",
  products: "Products",
  projectAddress: "Project address",
  projectType: "Project type",
  source: "Source",
  stage: "Stage",
  technologies: "Technologies of interest",
  value: "Value",
};

function orderedKeys<T extends string>(saved: unknown, fallback: readonly T[]) {
  if (!Array.isArray(saved)) return [...fallback];

  const allowed = new Set<T>(fallback);
  const clean = saved.filter(
    (item): item is T => typeof item === "string" && allowed.has(item as T),
  );
  const result = [...new Set(clean)];

  fallback
    .filter((key) => !result.includes(key))
    .forEach((key) => {
      const fallbackIndex = fallback.indexOf(key);
      const previousKey = fallback
        .slice(0, fallbackIndex)
        .reverse()
        .find((candidate) => result.includes(candidate));
      const nextKey = fallback
        .slice(fallbackIndex + 1)
        .find((candidate) => result.includes(candidate));

      if (previousKey) {
        result.splice(result.indexOf(previousKey) + 1, 0, key);
      } else if (nextKey) {
        result.splice(result.indexOf(nextKey), 0, key);
      } else {
        result.push(key);
      }
    });

  return result;
}

function readStoredKeys<T extends string>(
  storageKey: string,
  fallback: readonly T[],
) {
  if (typeof window === "undefined") return [...fallback];

  try {
    return orderedKeys(
      JSON.parse(localStorage.getItem(storageKey) ?? "null"),
      fallback,
    );
  } catch {
    return [...fallback];
  }
}

function moveKey<T extends string>(keys: T[], from: T, to: T) {
  if (from === to) return keys;
  const next = keys.filter((key) => key !== from);
  const targetIndex = next.indexOf(to);
  if (targetIndex < 0) return keys;
  next.splice(targetIndex, 0, from);
  return next;
}

function saveStoredKeys<T extends string>(storageKey: string, keys: T[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(keys));
}

function LeadEnquirySummary({
  allMetrics,
  selectedMetricKeys,
  setSelectedMetricKeys,
}: {
  allMetrics: LeadMetric[];
  selectedMetricKeys: LeadMetricKey[];
  setSelectedMetricKeys: (keys: LeadMetricKey[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const metricsByKey = new Map(
    allMetrics.map((metric) => [metric.key, metric]),
  );
  const visibleMetrics = selectedMetricKeys
    .map((key) => metricsByKey.get(key))
    .filter((metric): metric is LeadMetric => Boolean(metric));

  function toggleMetric(key: LeadMetricKey) {
    const next = selectedMetricKeys.includes(key)
      ? selectedMetricKeys.filter((item) => item !== key)
      : [...selectedMetricKeys, key];

    if (next.length) {
      setSelectedMetricKeys(next);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600 ring-1 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-900/40">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Lead enquiry
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/40">
                Live
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Primary lead details visible while the conversation stays active.
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
          >
            <Settings2 className="h-4 w-4" />
            Metrics
          </button>
          {isOpen ? (
            <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl shadow-gray-950/10 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Top bar metrics
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedMetricKeys(defaultMetricKeys)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300"
                >
                  Reset
                </button>
              </div>
              <div className="mt-2 grid gap-1">
                {allMetrics.map((metric) => (
                  <label
                    key={metric.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMetricKeys.includes(metric.key)}
                      onChange={() => toggleMetric(metric.key)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                    {metric.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-5">
        {visibleMetrics.map((metric) => {
          const Icon = metric.Icon;
          return (
            <div
              key={metric.key}
              className="min-w-0 border-b border-gray-100 px-4 py-4 sm:border-r xl:border-b-0 dark:border-gray-800"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {metric.label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 font-semibold text-gray-900 dark:text-white">
                    {metric.value || "Not captured"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SidebarSection({
  children,
  dragKey,
  isDraggable = true,
  label,
  onDragStart,
  onDrop,
}: {
  children: React.ReactNode;
  dragKey: SidebarPanelKey;
  isDraggable?: boolean;
  label: string;
  onDragStart: (key: SidebarPanelKey) => void;
  onDrop: (key: SidebarPanelKey) => void;
}) {
  return (
    <section
      draggable={isDraggable}
      onDragStart={() => onDragStart(dragKey)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(dragKey)}
      className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {label}
        </h2>
        {isDraggable ? (
          <GripVertical
            className="h-4 w-4 cursor-grab text-gray-400"
            aria-label={`Drag ${label}`}
          />
        ) : null}
      </div>
      {children}
    </section>
  );
}

function NotesPanel({ notes }: { notes: SaleNote[] }) {
  const [note] = notes;

  return (
    <div className="p-4">
      <Link
        href="/notes"
        className="mb-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
      >
        Add note
      </Link>
      {note ? (
        <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3 dark:border-purple-900/40 dark:bg-purple-500/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
              Pinned note
            </p>
            <MoreHorizontal className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 line-clamp-4 text-sm leading-6 text-gray-800 dark:text-white/90">
            {note.body}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {note.createdAt} · {note.userName}
          </p>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm leading-6 text-gray-500 dark:border-gray-800 dark:text-gray-400">
          No notes yet. Add the first customer or lead note from Notes.
        </p>
      )}
      <Link
        href="/notes"
        className="mt-3 inline-flex w-full items-center justify-between text-sm font-semibold text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-300"
      >
        View all notes
        <span aria-hidden="true">›</span>
      </Link>
    </div>
  );
}

function DocumentsPanel({
  contactId,
  documents,
  saleId,
  uploadPolicy,
}: {
  contactId: string | null;
  documents: SaleDocument[];
  saleId: string;
  uploadPolicy: SaleDetailAIWorkspaceProps["documentUploadPolicy"];
}) {
  const [activeScope, setActiveScope] = useState<"customer" | "lead">("lead");
  const [documentType, setDocumentType] = useState<string>(
    documentUploadTypeDefinitions[0].key,
  );
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [resetSignal, setResetSignal] = useState(0);
  const [state, formAction, isPending] = useActionState<
    SaleDocumentActionState,
    FormData
  >(uploadSaleDocumentAction, {
    ok: false,
    message: "",
  });
  const scopedDocuments = documents.filter(
    (document) => document.scope === activeScope,
  );

  useEffect(() => {
    if (!state.ok) return;
    queueMicrotask(() => {
      setSelectedFileNames([]);
      setResetSignal((value) => value + 1);
    });
  }, [state.ok]);

  return (
    <div className="p-4">
      <div className="mb-3 inline-grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-xs font-semibold dark:bg-white/[0.04]">
        {(["lead", "customer"] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() => setActiveScope(scope)}
            disabled={scope === "customer" && !contactId}
            className={`rounded-md px-3 py-1.5 transition ${
              activeScope === scope
                ? "bg-white text-brand-600 shadow-theme-xs dark:bg-gray-950 dark:text-brand-300"
                : "text-gray-500 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            {scope === "lead" ? "Lead docs" : "Customer docs"}
          </button>
        ))}
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="saleId" value={saleId} />
        <input type="hidden" name="contactId" value={contactId ?? ""} />
        <input type="hidden" name="scope" value={activeScope} />
        <input type="hidden" name="documentType" value={documentType} />
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Document type
          </span>
          <select
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value)}
            disabled={!uploadPolicy.isConfigured || isPending}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {documentUploadTypeDefinitions.map((definition) => (
              <option key={definition.key} value={definition.key}>
                {definition.label}
              </option>
            ))}
          </select>
        </label>
        <FileDropzone
          accept={uploadPolicy.allowedMimeTypes}
          disabled={!uploadPolicy.isConfigured || isPending}
          id="sale-document-upload"
          maxUploadMb={uploadPolicy.maxUploadMb}
          onSelectionChange={setSelectedFileNames}
          resetSignal={resetSignal}
          selectedFileNames={selectedFileNames}
          title="Drop documents here or choose files"
        />
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Notes
          </span>
          <textarea
            name="notes"
            rows={3}
            placeholder="Optional notes applied to every selected file"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            disabled={!uploadPolicy.isConfigured || isPending}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Tags
          </span>
          <input
            name="tagsText"
            placeholder="survey, utility bill"
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            disabled={!uploadPolicy.isConfigured || isPending}
          />
        </label>
        <button
          type="submit"
          disabled={
            !uploadPolicy.isConfigured || !selectedFileNames.length || isPending
          }
          className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? "Uploading..."
            : `Save ${selectedFileNames.length || ""} document${selectedFileNames.length === 1 ? "" : "s"}`}
        </button>
        {!uploadPolicy.isConfigured ? (
          <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
            Connect Cloudflare R2 before uploading lead documents.
          </p>
        ) : null}
        <ActionStateMessage state={state.message ? state : undefined} />
      </form>

      <div className="mt-4 space-y-2">
        {scopedDocuments.length ? (
          scopedDocuments.slice(0, 4).map((document) => (
            <div
              key={document.id}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-900/60 dark:hover:bg-brand-900/10"
            >
              <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                <FileIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                  {document.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                  {document.typeLabel} · {document.sizeLabel} ·{" "}
                  {document.createdAt} · {document.uploadedBy}
                </span>
              </span>
              <FilePreviewButton
                file={{
                  createdAt: document.createdAt,
                  mimeType: document.mimeType,
                  name: document.name,
                  notes: document.notes,
                  sizeLabel: document.sizeLabel,
                  tags: document.tags,
                  uploadedBy: document.uploadedBy,
                  url: document.url,
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
              />
              <a
                href={document.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                aria-label={`Open ${document.name}`}
              >
                <DownloadIcon className="h-4 w-4" />
              </a>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm leading-6 text-gray-500 dark:border-gray-800 dark:text-gray-400">
            No {activeScope === "lead" ? "lead" : "customer"} documents yet.
          </p>
        )}
      </div>
    </div>
  );
}

function fallbackSummary({
  title,
  communicationsCount,
}: {
  title: string;
  communicationsCount: number;
}) {
  return communicationsCount
    ? `${communicationsCount} conversation events are available for context on ${title}.`
    : "No conversation history yet. AI suggestions will improve once calls, emails or SMS are captured.";
}

function draftForChannel(
  result: SalesLeadAIResult | null,
  channel: ChannelKey,
) {
  if (!result) {
    return "Ready to draft a follow-up from the latest calls, emails and SMS.";
  }

  if (channel === "sms") return result.drafts.sms;
  if (channel === "phone") return result.drafts.phoneScript;

  return result.drafts.email.body;
}

function subjectForResult(result: SalesLeadAIResult | null) {
  return result?.drafts.email.subject ?? "Follow-up on your enquiry";
}

function AIGradientButton({
  children,
  className = "",
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`ai-gradient-button inline-flex rounded-lg p-[2px] shadow-sm shadow-cyan-100 transition disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-none ${className}`}
    >
      <span className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[6px] bg-white px-3 text-sm font-semibold text-gray-900 dark:bg-gray-950 dark:text-white">
        {children}
      </span>
    </button>
  );
}

function SalesAIReplyComposer({
  draft,
  emailSubject,
  error,
  isFullScreen,
  isLoading,
  isPending,
  onClose,
  onDraftChange,
  onEmailSubjectChange,
  onRegenerate,
  onSubmit,
  onToggleFullScreen,
  recipientEmail,
  recipientName,
  recipientPhone,
  result,
  selectedChannel,
  selectedTone,
  setSelectedChannel,
  setSelectedTone,
}: {
  draft: string;
  emailSubject: string;
  error: string | null;
  isFullScreen: boolean;
  isLoading: boolean;
  isPending: boolean;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onEmailSubjectChange: (value: string) => void;
  onRegenerate: () => void;
  onSubmit: () => void;
  onToggleFullScreen: () => void;
  recipientEmail: string | null;
  recipientName: string;
  recipientPhone: string | null;
  result: SalesLeadAIResult | null;
  selectedChannel: ChannelKey;
  selectedTone: ToneKey;
  setSelectedChannel: (channel: ChannelKey) => void;
  setSelectedTone: (tone: ToneKey) => void;
}) {
  const isPhone = selectedChannel === "phone";
  const isEmail = selectedChannel === "email";
  const primaryLabel = isPhone
    ? "Click to call"
    : isEmail
      ? "Send email"
      : "Send SMS";
  const primaryDisabled =
    isPending ||
    (selectedChannel === "sms" && !recipientPhone) ||
    (isPhone && !recipientPhone) ||
    (isEmail && !recipientEmail);

  const textareaClassName = isFullScreen
    ? "h-[min(54dvh,560px)]"
    : "h-48 sm:h-64";

  return (
    <section
      className={`flex min-h-0 flex-col border border-purple-100 bg-white shadow-2xl shadow-gray-950/10 dark:border-purple-900/40 dark:bg-gray-950 dark:shadow-black/40 ${
        isFullScreen
          ? "h-[calc(100dvh-1.5rem)] rounded-3xl p-3 sm:p-4"
          : "max-h-[min(86dvh,820px)] rounded-t-3xl p-3 sm:rounded-3xl sm:p-4"
      }`}
    >
      <div className="rounded-xl bg-gradient-to-r from-purple-50 via-white to-cyan-50 p-2.5 ring-1 ring-purple-100 dark:from-purple-500/10 dark:via-white/[0.02] dark:to-cyan-500/10 dark:ring-purple-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AILabel label="AI reply" />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTone}
              onChange={(event) =>
                setSelectedTone(event.target.value as ToneKey)
              }
              className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600 shadow-theme-xs outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
              aria-label="AI reply tone"
            >
              {tones.map((tone) => (
                <option key={tone.key} value={tone.key}>
                  {tone.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isLoading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-purple-100 bg-white px-3 text-xs font-semibold text-purple-700 shadow-theme-xs transition hover:border-purple-200 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-purple-900/40 dark:bg-gray-950 dark:text-purple-300 dark:hover:bg-purple-900/20"
            >
              <AISparkIcon wrapperClassName="size-3.5" />
              {isLoading ? "Generating..." : "Regenerate"}
            </button>
            <button
              type="button"
              onClick={onToggleFullScreen}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 shadow-theme-xs transition hover:border-gray-300 hover:text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:text-white"
            >
              {isFullScreen ? "Compact" : "Full screen"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-theme-xs transition hover:border-gray-300 hover:text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400 dark:hover:text-white"
              aria-label="Close AI reply composer"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-white/[0.04]">
        {channels.map((channel) => (
          <button
            key={channel.key}
            type="button"
            onClick={() => setSelectedChannel(channel.key)}
            className={`inline-flex h-8 min-w-0 items-center justify-center rounded-md px-2 text-xs font-semibold transition ${
              selectedChannel === channel.key
                ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            <span className="truncate">{channel.label}</span>
          </button>
        ))}
      </div>

      <div
        className={`mt-3 min-h-0 overflow-y-auto ${
          isFullScreen
            ? "grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px]"
            : "grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]"
        }`}
      >
        <div className="min-w-0">
          {isEmail ? (
            <input
              value={emailSubject}
              onChange={(event) => onEmailSubjectChange(event.target.value)}
              placeholder="Email subject"
              className="mb-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
            />
          ) : null}
          {isPhone ? (
            <div className="mb-2 rounded-lg border border-purple-100 bg-purple-50/70 px-3 py-2 text-xs leading-5 text-purple-800 dark:border-purple-900/40 dark:bg-purple-500/10 dark:text-purple-200">
              <span className="font-semibold">Call objective:</span> confirm
              requirements and secure the discovery call before Payaca
              estimation.
            </div>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={isPhone ? 7 : 6}
            className={`${textareaClassName} w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-6 text-gray-800 shadow-theme-xs transition outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90`}
            placeholder="Generate or write a follow-up..."
          />
          {result?.risks.length ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
              {result.risks[0]}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs leading-5 text-error-600 dark:text-error-400">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5 sm:gap-3 sm:p-3 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="space-y-1 text-xs leading-5 text-gray-500 sm:space-y-2 dark:text-gray-400">
            <p className="font-semibold text-gray-700 dark:text-gray-200">
              {isPhone
                ? recipientPhone || "No phone number"
                : isEmail
                  ? recipientEmail || "No email address"
                  : recipientPhone || "No phone number"}
            </p>
            <p className="hidden sm:block">{recipientName}</p>
            <p className="hidden sm:block">
              {result
                ? `${result.mode === "openai" ? result.model || "OpenAI" : "Fallback"} · ${new Date(result.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`
                : "AI draft not generated yet"}
            </p>
          </div>
          <AIGradientButton
            className="w-full"
            disabled={primaryDisabled}
            onClick={onSubmit}
          >
            {isPhone ? (
              <PhoneIcon className="h-4 w-4" />
            ) : isEmail ? (
              <MailIcon className="h-4 w-4" />
            ) : (
              <PaperPlaneIcon className="h-4 w-4" />
            )}
            {isPending ? "Sending..." : primaryLabel}
          </AIGradientButton>
        </div>
      </div>
    </section>
  );
}

function SalesAIReplyFloat({
  draft,
  emailSubject,
  error,
  isFullScreen,
  isLoading,
  isOpen,
  isPending,
  onClose,
  onDraftChange,
  onEmailSubjectChange,
  onOpen,
  onRegenerate,
  onSubmit,
  onToggleFullScreen,
  recipientEmail,
  recipientName,
  recipientPhone,
  result,
  selectedChannel,
  selectedTone,
  setSelectedChannel,
  setSelectedTone,
}: {
  draft: string;
  emailSubject: string;
  error: string | null;
  isFullScreen: boolean;
  isLoading: boolean;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onEmailSubjectChange: (value: string) => void;
  onOpen: () => void;
  onRegenerate: () => void;
  onSubmit: () => void;
  onToggleFullScreen: () => void;
  recipientEmail: string | null;
  recipientName: string;
  recipientPhone: string | null;
  result: SalesLeadAIResult | null;
  selectedChannel: ChannelKey;
  selectedTone: ToneKey;
  setSelectedChannel: (channel: ChannelKey) => void;
  setSelectedTone: (tone: ToneKey) => void;
}) {
  const channelLabel =
    channels.find((channel) => channel.key === selectedChannel)?.label ??
    "Reply";
  const actionLabel =
    selectedChannel === "phone"
      ? "Call"
      : selectedChannel === "sms"
        ? "SMS"
        : "Email";
  const preview = draft.trim() || "Generate or edit the next response";

  if (isOpen) {
    if (!isFullScreen) {
      return (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-40 bg-gray-950/15 backdrop-blur-[0.5px] dark:bg-black/35"
          />
          <div className="sticky bottom-0 z-50 mt-4">
            <div className="ai-bottom-sheet-enter">
              <SalesAIReplyComposer
                draft={draft}
                emailSubject={emailSubject}
                error={error}
                isFullScreen={isFullScreen}
                isLoading={isLoading}
                isPending={isPending}
                onClose={onClose}
                onDraftChange={onDraftChange}
                onEmailSubjectChange={onEmailSubjectChange}
                onRegenerate={onRegenerate}
                onSubmit={onSubmit}
                onToggleFullScreen={onToggleFullScreen}
                recipientEmail={recipientEmail}
                recipientName={recipientName}
                recipientPhone={recipientPhone}
                result={result}
                selectedChannel={selectedChannel}
                selectedTone={selectedTone}
                setSelectedChannel={setSelectedChannel}
                setSelectedTone={setSelectedTone}
              />
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <div
          className="fixed inset-0 z-[100000] bg-gray-950/20 backdrop-blur-[1.5px] dark:bg-black/45"
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          className={`fixed inset-x-0 bottom-0 z-[100001] px-3 pb-3 sm:px-5 sm:pb-5 ${
            isFullScreen ? "top-0 pt-3 sm:pt-5" : ""
          }`}
        >
          <div
            className={`mx-auto w-full ${
              isFullScreen ? "h-full max-w-none" : "max-w-5xl"
            }`}
          >
            <div className="ai-bottom-sheet-enter h-full">
              <SalesAIReplyComposer
                draft={draft}
                emailSubject={emailSubject}
                error={error}
                isFullScreen={isFullScreen}
                isLoading={isLoading}
                isPending={isPending}
                onClose={onClose}
                onDraftChange={onDraftChange}
                onEmailSubjectChange={onEmailSubjectChange}
                onRegenerate={onRegenerate}
                onSubmit={onSubmit}
                onToggleFullScreen={onToggleFullScreen}
                recipientEmail={recipientEmail}
                recipientName={recipientName}
                recipientPhone={recipientPhone}
                result={result}
                selectedChannel={selectedChannel}
                selectedTone={selectedTone}
                setSelectedChannel={setSelectedChannel}
                setSelectedTone={setSelectedTone}
              />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="sticky bottom-4 z-40 mt-4">
      <div className="rounded-2xl bg-white/70 p-1 backdrop-blur-sm dark:bg-gray-950/70">
        <button
          type="button"
          onClick={onOpen}
          className="ai-gradient-button block w-full rounded-2xl p-[2px] text-left shadow-2xl shadow-gray-950/15 transition hover:-translate-y-0.5 dark:shadow-black/50"
          aria-label="Open AI reply composer"
        >
          <span className="flex min-h-[64px] items-center gap-3 rounded-[14px] bg-white px-3 py-2.5 sm:px-4 dark:bg-gray-950">
            <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-50 via-emerald-50 to-lime-50 ring-1 ring-cyan-100 dark:from-cyan-500/10 dark:via-emerald-500/10 dark:to-lime-500/10 dark:ring-cyan-900/40">
              <AISparkIcon wrapperClassName="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  AI reply
                </span>
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 ring-1 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-900/40">
                  {channelLabel}
                </span>
                {isLoading ? (
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                    Generating...
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                {preview}
              </span>
            </span>
            <span className="hidden shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 sm:inline-flex dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-300">
              {actionLabel} draft
            </span>
            <ChevronUpIcon className="h-5 w-5 shrink-0 text-gray-400" />
          </span>
        </button>
      </div>
    </div>
  );
}

export default function SaleDetailAIWorkspace({
  initialResult,
  saleId,
  sale,
  communications,
  communicationsCount,
  contactId,
  automationPanel,
  documents,
  documentUploadPolicy,
  notes,
  documentsPanel,
  discoveryPanel,
  recipientEmail,
  recipientName,
  recipientPhone,
  scopePanel,
}: SaleDetailAIWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WorkspaceTabKey>("conversation");
  const [workspaceTabOrder, setWorkspaceTabOrder] = useState(() =>
    readStoredKeys(
      "id30:sale-detail:workspace-tabs",
      workspaceTabs.map((tab) => tab.key),
    ),
  );
  const [draggedTab, setDraggedTab] = useState<WorkspaceTab["key"] | null>(
    null,
  );
  const [sidebarPanelOrder, setSidebarPanelOrder] = useState(() =>
    readStoredKeys(
      "id30:sale-detail:sidebar-panels",
      sidebarPanels.map((panel) => panel.key),
    ),
  );
  const [draggedSidebarPanel, setDraggedSidebarPanel] =
    useState<SidebarPanelKey | null>(null);
  const [selectedMetricKeys, setSelectedMetricKeysState] = useState(() =>
    readStoredKeys("id30:sale-detail:top-metrics", defaultMetricKeys),
  );
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>("email");
  const [selectedTone, setSelectedTone] = useState<ToneKey>("professional");
  const [result, setResult] = useState<SalesLeadAIResult | null>(
    initialResult ?? null,
  );
  const [draft, setDraft] = useState(() =>
    draftForChannel(initialResult ?? null, "email"),
  );
  const [emailSubject, setEmailSubject] = useState(() =>
    subjectForResult(initialResult ?? null),
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialResult);
  const [isSending, setIsSending] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isComposerFullScreen, setIsComposerFullScreen] = useState(false);
  const tabsByKey = useMemo(
    () => new Map(workspaceTabs.map((tab) => [tab.key, tab])),
    [],
  );
  const orderedTabs = workspaceTabOrder
    .map((key) => tabsByKey.get(key))
    .filter((tab): tab is WorkspaceTab => Boolean(tab));
  const leadMetrics: LeadMetric[] = useMemo(
    () => [
      {
        key: "name",
        label: leadMetricLabels.name,
        value: recipientName,
        Icon: UserRound,
      },
      {
        key: "projectAddress",
        label: leadMetricLabels.projectAddress,
        value: sale.projectAddress,
        Icon: MapPin,
      },
      {
        key: "technologies",
        label: leadMetricLabels.technologies,
        value: sale.technologies,
        Icon: Activity,
      },
      {
        key: "projectType",
        label: leadMetricLabels.projectType,
        value: sale.projectType,
        Icon: Home,
      },
      {
        key: "leadStartDate",
        label: leadMetricLabels.leadStartDate,
        value: sale.leadStartDate,
        Icon: CalendarDays,
      },
      {
        key: "value",
        label: leadMetricLabels.value,
        value: sale.value,
        Icon: CircleDollarSign,
      },
      {
        key: "expectedClose",
        label: leadMetricLabels.expectedClose,
        value: sale.expectedCloseDate,
        Icon: CalendarDays,
      },
      {
        key: "stage",
        label: leadMetricLabels.stage,
        value: sale.stage,
        Icon: PackageCheck,
      },
      {
        key: "source",
        label: leadMetricLabels.source,
        value: sale.source,
        Icon: FolderOpen,
      },
      {
        key: "owner",
        label: leadMetricLabels.owner,
        value: sale.ownerName,
        Icon: UserRound,
      },
      {
        key: "products",
        label: leadMetricLabels.products,
        value: sale.technologies,
        Icon: PackageCheck,
      },
      {
        key: "nextStep",
        label: leadMetricLabels.nextStep,
        value: sale.nextStep ?? "Not captured",
        Icon: ClipboardList,
      },
    ],
    [recipientName, sale],
  );

  function setSelectedMetricKeys(keys: LeadMetricKey[]) {
    setSelectedMetricKeysState(keys);
    saveStoredKeys("id30:sale-detail:top-metrics", keys);
  }

  function reorderWorkspaceTabs(targetKey: WorkspaceTab["key"]) {
    if (!draggedTab) return;
    const next = moveKey(workspaceTabOrder, draggedTab, targetKey);
    setWorkspaceTabOrder(next);
    saveStoredKeys("id30:sale-detail:workspace-tabs", next);
    setDraggedTab(null);
  }

  function reorderSidebarPanels(targetKey: SidebarPanelKey) {
    if (!draggedSidebarPanel) return;
    const next = moveKey(sidebarPanelOrder, draggedSidebarPanel, targetKey);
    setSidebarPanelOrder(next);
    saveStoredKeys("id30:sale-detail:sidebar-panels", next);
    setDraggedSidebarPanel(null);
  }

  async function generate(
    channel = selectedChannel,
    forceRefresh = false,
    showLoading = true,
    tone = selectedTone,
  ) {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/ai/sales-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId,
          preferredChannel: channel,
          forceRefresh,
          tone,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | SalesLeadAIResult
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Sales AI could not generate guidance.",
        );
      }

      setResult(payload as SalesLeadAIResult);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Sales AI could not generate guidance.",
      );
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    setResult(initialResult ?? null);
    setIsLoading(!initialResult);
  }, [initialResult, saleId]);

  useEffect(() => {
    if (initialResult) {
      void generate("email", false, false);
      return;
    }

    void generate("email");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResult, saleId]);

  useEffect(() => {
    setDraft(draftForChannel(result, selectedChannel));
    if (selectedChannel === "email") {
      setEmailSubject(subjectForResult(result));
    }
  }, [result, selectedChannel]);

  function changeTone(tone: ToneKey) {
    setSelectedTone(tone);
    void generate(selectedChannel, true, true, tone);
  }

  const actionError = useMemo(() => {
    if (selectedChannel === "email" && !recipientEmail) {
      return "Add an email address before using the email draft.";
    }
    if (
      (selectedChannel === "sms" || selectedChannel === "phone") &&
      !recipientPhone
    ) {
      return "Add a phone number before using this action.";
    }
    return null;
  }, [recipientEmail, recipientPhone, selectedChannel]);

  function startCall() {
    if (!recipientPhone) {
      setError("Add a phone number before calling.");
      return;
    }

    triggerSoftphoneDial(recipientPhone, recipientName, {
      contextName: sale.title,
      opportunityId: saleId,
      contactId: contactId ?? undefined,
    });
  }

  async function createAiTask() {
    if (!result) return;

    setIsCreatingTask(true);
    setTaskFeedback(null);
    setError(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: result.nextStep.title,
          description: result.nextStep.rationale,
          contactId,
          opportunityId: saleId,
          metadata: {
            source: "sales_ai",
            channel: result.nextStep.channel,
            urgency: result.nextStep.urgency,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Task could not be created.");
      }

      setTaskFeedback("Task created");
      router.refresh();
    } catch (taskError) {
      setError(
        taskError instanceof Error
          ? taskError.message
          : "Task could not be created.",
      );
    } finally {
      setIsCreatingTask(false);
    }
  }

  async function submitDraft() {
    const body = draft.trim();
    setError(null);

    if (!body) {
      setError("Write a message before using this action.");
      return;
    }

    if (selectedChannel === "phone") {
      startCall();
      return;
    }

    if (selectedChannel === "email") {
      if (!recipientEmail) {
        setError("Add an email address before using the email draft.");
        return;
      }

      setIsSending(true);
      try {
        const response = await fetch("/api/mailersend/email/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            opportunityId: saleId,
            contactId,
            to: recipientEmail,
            subject: emailSubject,
            body,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
        };

        if (!response.ok) {
          setError(payload.error ?? "Email could not be sent.");
          return;
        }

        setIsComposerOpen(false);
        router.refresh();
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (!recipientPhone) {
      setError("Add a phone number before sending SMS.");
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/twilio/messaging/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          opportunityId: saleId,
          contactId,
          to: recipientPhone,
          body,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "SMS could not be sent.");
        return;
      }

      setIsComposerOpen(false);
      router.refresh();
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <RealtimePageRefresh
        topics={[
          realtimeTopics.saleConversation(saleId),
          ...(contactId ? [realtimeTopics.contactConversation(contactId)] : []),
        ]}
      />
      <LeadEnquirySummary
        allMetrics={leadMetrics}
        selectedMetricKeys={selectedMetricKeys}
        setSelectedMetricKeys={setSelectedMetricKeys}
      />

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px] 3xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="grid min-w-0 lg:grid-cols-[184px_minmax(0,1fr)]">
              <nav
                className="flex min-w-0 overflow-x-auto border-b border-gray-200 bg-gray-50/80 p-1.5 lg:block lg:overflow-visible lg:border-r lg:border-b-0 lg:p-0 dark:border-gray-800 dark:bg-white/[0.02]"
                aria-label="Sale workspace sections"
              >
                {orderedTabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  const Icon = tab.Icon;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      draggable
                      onDragStart={() => setDraggedTab(tab.key)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => reorderWorkspaceTabs(tab.key)}
                      aria-disabled={tab.disabled}
                      onClick={() => {
                        if (!tab.disabled) {
                          setActiveTab(tab.key as WorkspaceTabKey);
                        }
                      }}
                      className={`group flex min-w-[148px] items-center gap-3 px-3 py-3 text-left text-sm transition lg:w-[calc(100%+1px)] lg:min-w-0 lg:border-b lg:border-gray-200 lg:last:border-b-0 dark:lg:border-gray-800 ${
                        isActive
                          ? "rounded-xl bg-white text-brand-700 shadow-theme-xs ring-1 ring-gray-200 lg:rounded-none lg:shadow-none lg:ring-0 dark:bg-gray-950 dark:text-brand-300 dark:ring-gray-800"
                          : tab.disabled
                            ? "cursor-not-allowed text-gray-400 dark:text-gray-600"
                            : "text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.04] dark:hover:text-white"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-gray-300 lg:block" />
                      <span
                        className={`inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${
                          isActive
                            ? "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40"
                            : "bg-white text-gray-500 ring-gray-200 group-hover:text-gray-800 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {tab.label}
                        </span>
                        <span className="mt-0.5 hidden text-xs leading-4 text-gray-500 lg:line-clamp-2 dark:text-gray-400">
                          {tab.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="min-w-0 bg-white dark:bg-white/[0.03]">
                {activeTab === "conversation" ? (
                  <SaleConversationThread
                    communications={communications}
                    embedded
                    onReply={() => setIsComposerOpen(true)}
                    totalCount={communicationsCount}
                  />
                ) : null}
                {activeTab === "lead" ? scopePanel : null}
                {activeTab === "documents" ? documentsPanel : null}
                {activeTab === "discovery" ? discoveryPanel : null}
                {activeTab === "automation" ? automationPanel : null}
              </div>
            </div>
          </section>

          {activeTab === "conversation" || isComposerOpen ? (
            <SalesAIReplyFloat
              draft={draft}
              emailSubject={emailSubject}
              error={error || actionError}
              isFullScreen={isComposerFullScreen}
              isLoading={isLoading}
              isOpen={isComposerOpen}
              isPending={isSending}
              onClose={() => setIsComposerOpen(false)}
              onDraftChange={setDraft}
              onEmailSubjectChange={setEmailSubject}
              onOpen={() => setIsComposerOpen(true)}
              onRegenerate={() =>
                void generate(selectedChannel, true, true, selectedTone)
              }
              onSubmit={() => void submitDraft()}
              onToggleFullScreen={() =>
                setIsComposerFullScreen((current) => !current)
              }
              recipientEmail={recipientEmail}
              recipientName={recipientName}
              recipientPhone={recipientPhone}
              result={result}
              selectedChannel={selectedChannel}
              selectedTone={selectedTone}
              setSelectedChannel={setSelectedChannel}
              setSelectedTone={changeTone}
            />
          ) : null}
        </main>

        <aside className="grid min-w-0 content-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          {sidebarPanelOrder.map((panelKey) => {
            if (panelKey === "notes") {
              return (
                <SidebarSection
                  key={panelKey}
                  dragKey={panelKey}
                  label="Notes"
                  onDragStart={setDraggedSidebarPanel}
                  onDrop={reorderSidebarPanels}
                >
                  <NotesPanel notes={notes} />
                </SidebarSection>
              );
            }

            if (panelKey === "documents") {
              return (
                <SidebarSection
                  key={panelKey}
                  dragKey={panelKey}
                  label="Documents"
                  onDragStart={setDraggedSidebarPanel}
                  onDrop={reorderSidebarPanels}
                >
                  <DocumentsPanel
                    contactId={contactId}
                    documents={documents}
                    saleId={saleId}
                    uploadPolicy={documentUploadPolicy}
                  />
                </SidebarSection>
              );
            }

            return (
              <div
                key={panelKey}
                draggable
                onDragStart={() => setDraggedSidebarPanel(panelKey)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorderSidebarPanels(panelKey)}
                className="min-w-0"
              >
                <CompactAIGuidanceRail
                  actionDisabledReason={null}
                  currentStage={sale.stage}
                  error={error}
                  fallbackSummary={fallbackSummary({
                    title: sale.title,
                    communicationsCount,
                  })}
                  isCreatingTask={isCreatingTask}
                  isLoading={isLoading}
                  label="Sales AI"
                  onCall={startCall}
                  onCreateTask={() => void createAiTask()}
                  onDraft={() => {
                    setSelectedChannel("email");
                    setIsComposerOpen(true);
                  }}
                  onRegenerate={() =>
                    void generate(selectedChannel, true, true, selectedTone)
                  }
                  result={result}
                  statusLabel={sale.stage}
                  taskFeedback={taskFeedback}
                />
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
