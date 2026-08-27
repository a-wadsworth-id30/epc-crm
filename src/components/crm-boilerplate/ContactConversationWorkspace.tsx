"use client";

import dynamic from "next/dynamic";
import {
  Building2,
  ClipboardList,
  FolderOpen,
  GripVertical,
  Mail,
  MessageSquareText,
  Phone,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import RealtimePageRefresh from "@/components/crm-boilerplate/RealtimePageRefresh";
import type {
  SaleConversationItem,
  SaleConversationThreadProps,
} from "@/components/crm-boilerplate/SaleConversationThread";
import type {
  ContactAIResult,
  ContactReplyChannelKey as ChannelKey,
  ContactReplyFloatProps,
  ContactReplyToneKey as ToneKey,
} from "@/components/crm-boilerplate/ContactReplyFloat";
import { realtimeTopics } from "@/lib/realtime/topic-names";
import { triggerSoftphoneDial } from "@/lib/telephony/softphone-dial";

type ReplyTarget = {
  id: string;
  title: string;
  stage: string;
} | null;

type ContactWorkspaceTabKey =
  | "conversation"
  | "profile"
  | "leads"
  | "documents";

type ContactSummaryMethod = {
  href: string;
  label: string;
  value: string;
};

export type ContactConversationWorkspaceProps = {
  communications: SaleConversationItem[];
  communicationsCount?: number;
  contactId: string;
  contactName: string;
  closedLeadCount: number;
  documentCount: number;
  documentPanel?: ReactNode;
  leadsPanel: ReactNode;
  openLeadCount: number;
  profilePanel: ReactNode;
  recipientEmail: string | null;
  recipientEmails: ContactSummaryMethod[];
  recipientPhone: string | null;
  recipientPhones: ContactSummaryMethod[];
  replyTarget: ReplyTarget;
  summary: {
    companyName: string | null;
    leadSource: string | null;
    role: string | null;
  };
};

type ContactWorkspaceTab = {
  key: ContactWorkspaceTabKey;
  label: string;
  description: string;
  Icon: LucideIcon;
};

type CompactAIGuidanceRailProps = {
  actionDisabledReason?: string | null;
  currentStage: string;
  error: string | null;
  fallbackSummary: string;
  isCreatingTask: boolean;
  isLoading: boolean;
  label: string;
  onCall: () => void;
  onCreateTask: () => void;
  onDraft: () => void;
  onRegenerate: () => void;
  result: ContactAIResult | null;
  statusLabel: string;
  taskFeedback: string | null;
};

const ContactReplyFloat = dynamic(
  () =>
    import("@/components/crm-boilerplate/ContactReplyFloat").then(
      (module) => module.ContactReplyFloat,
    ),
  { ssr: false, loading: () => null },
) as ComponentType<ContactReplyFloatProps>;

const SaleConversationThread = dynamic<SaleConversationThreadProps>(
  () => import("@/components/crm-boilerplate/SaleConversationThread"),
  { ssr: false, loading: () => <ConversationThreadSkeleton /> },
);

const CompactAIGuidanceRail = dynamic(
  () => import("@/components/crm-boilerplate/CompactAIGuidanceRail"),
  { ssr: false, loading: () => <AIGuidanceRailSkeleton /> },
) as ComponentType<CompactAIGuidanceRailProps>;

const workspaceTabs: ContactWorkspaceTab[] = [
  {
    key: "conversation",
    label: "Conversation",
    description: "Calls, emails, SMS and website activity",
    Icon: MessageSquareText,
  },
  {
    key: "profile",
    label: "Contact Profile",
    description: "Email, phone, company, role and address",
    Icon: UserRound,
  },
  {
    key: "leads",
    label: "Leads & Deals",
    description: "Open and closed sales linked to this person",
    Icon: ClipboardList,
  },
  {
    key: "documents",
    label: "Documents",
    description: "Files, upload links, shares and signatures",
    Icon: FolderOpen,
  },
];

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

function ContactWorkspaceSummary({
  closedLeadCount,
  communicationCount,
  contactName,
  documentCount,
  openLeadCount,
  recipientEmails,
  recipientPhones,
  summary,
}: {
  closedLeadCount: number;
  communicationCount: number;
  contactName: string;
  documentCount: number;
  openLeadCount: number;
  recipientEmails: ContactSummaryMethod[];
  recipientPhones: ContactSummaryMethod[];
  summary: ContactConversationWorkspaceProps["summary"];
}) {
  const metrics = [
    {
      Icon: Mail,
      label: "Email",
      value: (
        <ContactSummaryMethodList
          emptyLabel="Not captured"
          methods={recipientEmails}
        />
      ),
    },
    {
      Icon: Phone,
      label: "Phone",
      value: (
        <ContactSummaryMethodList
          emptyLabel="Not captured"
          methods={recipientPhones}
        />
      ),
    },
    {
      Icon: Building2,
      label: "Company / role",
      value: (
        <CompanyRoleSummary
          companyName={summary.companyName}
          role={summary.role}
        />
      ),
    },
    {
      Icon: ClipboardList,
      label: "Linked leads",
      value: `${openLeadCount} open / ${closedLeadCount} closed`,
    },
    {
      Icon: FolderOpen,
      label: "Documents",
      value: `${documentCount} file${documentCount === 1 ? "" : "s"}`,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Contact workspace
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/40">
                Live
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {contactName} | {communicationCount} conversation item
              {communicationCount === 1 ? "" : "s"}
              {summary.leadSource ? ` | ${summary.leadSource}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.Icon;

          return (
            <div
              key={metric.label}
              className="min-w-0 border-b border-gray-100 px-4 py-4 sm:border-r 2xl:border-b-0 dark:border-gray-800"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {metric.label}
                  </p>
                  {typeof metric.value === "string" ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-5 font-semibold text-gray-900 dark:text-white">
                      {metric.value}
                    </p>
                  ) : (
                    <div className="mt-1 text-sm leading-5 font-semibold text-gray-900 dark:text-white">
                      {metric.value}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompanyRoleSummary({
  companyName,
  role,
}: {
  companyName: string | null;
  role: string | null;
}) {
  return (
    <span className="block min-w-0 space-y-1">
      <span className="block line-clamp-2">
        {companyName || "Not linked"}
      </span>
      {role ? (
        <span className="block text-xs leading-4 font-medium text-gray-500 dark:text-gray-400">
          {role}
        </span>
      ) : null}
    </span>
  );
}

function ContactSummaryMethodList({
  emptyLabel,
  methods,
}: {
  emptyLabel: string;
  methods: ContactSummaryMethod[];
}) {
  if (!methods.length) return <span>{emptyLabel}</span>;

  return (
    <span className="block space-y-1">
      {methods.map((method, index) => (
        <a
          key={`${method.value}-${index}`}
          href={method.href}
          className="block min-w-0 rounded-md py-0.5 text-gray-900 transition hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
          title={`${method.label}: ${method.value}`}
        >
          <span className="mr-1.5 inline-flex h-4 items-center rounded-full bg-gray-100 px-1 text-[10px] font-semibold text-gray-500 dark:bg-white/10 dark:text-gray-300">
            {method.label}
          </span>
          <span className="break-all">{method.value}</span>
        </a>
      ))}
    </span>
  );
}

function draftForChannel(result: ContactAIResult | null, channel: ChannelKey) {
  if (!result) {
    return "Ready to draft a follow-up from this customer's calls, emails and SMS.";
  }

  if (channel === "sms") return result.drafts.sms;
  if (channel === "phone") return result.drafts.phoneScript;

  return result.drafts.email.body;
}

function subjectForResult(result: ContactAIResult | null) {
  return result?.drafts.email.subject ?? "Follow-up";
}

function AIGuidanceRailSkeleton() {
  return (
    <section className="overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-theme-xs dark:border-purple-900/40 dark:bg-white/[0.03]">
      <div className="flex min-h-10 items-center gap-2 border-b border-purple-100 px-3 py-2 dark:border-purple-900/40">
        <div className="size-6 rounded-lg bg-purple-50 dark:bg-purple-500/10" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3 w-28 rounded-full bg-gray-100 dark:bg-white/[0.06]" />
          <div className="h-2.5 w-20 rounded-full bg-gray-100 dark:bg-white/[0.06]" />
        </div>
      </div>
      <div className="space-y-2.5 p-3">
        <div className="h-20 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
        <div className="h-24 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
        <div className="h-16 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
      </div>
    </section>
  );
}

function ConversationThreadSkeleton() {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-4 py-4 dark:border-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="h-5 w-44 rounded bg-gray-100 dark:bg-white/[0.08]" />
            <div className="mt-2 h-3 w-72 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
          </div>
          <div className="h-9 w-28 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["all", "calls", "emails", "sms", "website"].map((item) => (
            <div
              key={item}
              className="h-8 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]"
            />
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {["one", "two", "three", "four"].map((item) => (
          <div key={item} className="flex gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-gray-100 dark:bg-white/[0.08]" />
            <div className="min-w-0 flex-1 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-3">
                <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="h-3 w-16 rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="mt-3 h-3 w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="mt-2 h-3 w-4/5 rounded bg-gray-50 dark:bg-white/[0.05]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ContactConversationWorkspace({
  communications,
  communicationsCount,
  contactId,
  contactName,
  closedLeadCount,
  documentCount,
  documentPanel,
  leadsPanel,
  openLeadCount,
  profilePanel,
  recipientEmail,
  recipientEmails,
  recipientPhone,
  recipientPhones,
  replyTarget,
  summary,
}: ContactConversationWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] =
    useState<ContactWorkspaceTabKey>("conversation");
  const [workspaceTabOrder, setWorkspaceTabOrder] = useState(() =>
    readStoredKeys(
      "id30:contact-detail:workspace-tabs",
      workspaceTabs.map((tab) => tab.key),
    ),
  );
  const [draggedTab, setDraggedTab] = useState<ContactWorkspaceTabKey | null>(
    null,
  );
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>("email");
  const [selectedTone, setSelectedTone] = useState<ToneKey>("professional");
  const [result, setResult] = useState<ContactAIResult | null>(null);
  const [draft, setDraft] = useState(() => draftForChannel(null, "email"));
  const [emailSubject, setEmailSubject] = useState(() =>
    subjectForResult(null),
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    .filter((tab): tab is ContactWorkspaceTab => Boolean(tab));
  const loadedCommunicationCount = communications.length;
  const totalCommunicationCount = Math.max(
    communicationsCount ?? loadedCommunicationCount,
    loadedCommunicationCount,
  );

  function reorderWorkspaceTabs(targetKey: ContactWorkspaceTabKey) {
    if (!draggedTab) return;
    const next = moveKey(workspaceTabOrder, draggedTab, targetKey);
    setWorkspaceTabOrder(next);
    saveStoredKeys("id30:contact-detail:workspace-tabs", next);
    setDraggedTab(null);
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
      const response = await fetch("/api/ai/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          preferredChannel: channel,
          forceRefresh,
          tone,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ContactAIResult
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Customer AI could not generate guidance.",
        );
      }

      setResult(payload as ContactAIResult);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Customer AI could not generate guidance.",
      );
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    void generate("email");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

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
    if (
      (selectedChannel === "email" || selectedChannel === "sms") &&
      !replyTarget
    ) {
      return "Create or link a lead before sending email or SMS from this page.";
    }
    return null;
  }, [recipientEmail, recipientPhone, replyTarget, selectedChannel]);

  function startCall() {
    if (!recipientPhone) {
      setError("Add a phone number before calling.");
      return;
    }

    triggerSoftphoneDial(recipientPhone, contactName, {
      contextName: replyTarget?.title ?? "Contact call",
      opportunityId: replyTarget?.id,
      contactId,
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
          opportunityId: replyTarget?.id,
          metadata: {
            source: "contact_ai",
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

    if (!replyTarget) {
      setError("Create or link a lead before sending from this contact page.");
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
            opportunityId: replyTarget.id,
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
          opportunityId: replyTarget.id,
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
          realtimeTopics.contactConversation(contactId),
          ...(replyTarget
            ? [realtimeTopics.saleConversation(replyTarget.id)]
            : []),
        ]}
      />

      <ContactWorkspaceSummary
        closedLeadCount={closedLeadCount}
        communicationCount={totalCommunicationCount}
        contactName={contactName}
        documentCount={documentCount}
        openLeadCount={openLeadCount}
        recipientEmails={recipientEmails}
        recipientPhones={recipientPhones}
        summary={summary}
      />

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px] 3xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="grid min-w-0 lg:grid-cols-[184px_minmax(0,1fr)]">
              <nav
                className="flex min-w-0 overflow-x-auto border-b border-gray-200 bg-gray-50/80 p-1.5 lg:block lg:overflow-visible lg:border-r lg:border-b-0 lg:p-0 dark:border-gray-800 dark:bg-white/[0.02]"
                aria-label="Contact workspace sections"
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
                      onClick={() => setActiveTab(tab.key)}
                      className={`group flex min-w-[148px] items-center gap-3 px-3 py-3 text-left text-sm transition lg:w-[calc(100%+1px)] lg:min-w-0 lg:border-b lg:border-gray-200 lg:last:border-b-0 dark:lg:border-gray-800 ${
                        isActive
                          ? "rounded-xl bg-white text-brand-700 shadow-theme-xs ring-1 ring-gray-200 lg:rounded-none lg:shadow-none lg:ring-0 dark:bg-gray-950 dark:text-brand-300 dark:ring-gray-800"
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
                    title="Customer conversation"
                    description="Calls, SMS, email and website activity across every linked lead."
                    embedded
                    helpText="Combines the customer's communication history across all linked leads, including calls, emails, SMS and tracked website touchpoints."
                    emptyLabel="No customer conversation yet. Calls, SMS, email and website activity will appear here once linked to this contact."
                    onReply={() => setIsComposerOpen(true)}
                    totalCount={totalCommunicationCount}
                  />
                ) : null}
                {activeTab === "profile" ? profilePanel : null}
                {activeTab === "leads" ? leadsPanel : null}
                {activeTab === "documents" ? documentPanel : null}
              </div>
            </div>
          </section>

          {activeTab === "conversation" || isComposerOpen ? (
            <ContactReplyFloat
              contactName={contactName}
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
          <CompactAIGuidanceRail
            actionDisabledReason={null}
            currentStage={replyTarget?.stage ?? "Contact"}
            error={error}
            fallbackSummary={`${totalCommunicationCount} customer conversation item${
              totalCommunicationCount === 1 ? "" : "s"
            } available.`}
            isCreatingTask={isCreatingTask}
            isLoading={isLoading}
            label="Contact AI"
            onCall={startCall}
            onCreateTask={() => void createAiTask()}
            onDraft={() => {
              setActiveTab("conversation");
              setSelectedChannel("email");
              setIsComposerOpen(true);
            }}
            onRegenerate={() =>
              void generate(selectedChannel, true, true, selectedTone)
            }
            result={result}
            statusLabel={replyTarget?.stage ?? "CONTACT"}
            taskFeedback={taskFeedback}
          />
        </aside>
      </div>
    </div>
  );
}
