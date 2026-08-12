import {
  type AIConversationEvent,
  buildAIConversationContext,
} from "@/lib/ai/conversation-context";

export type CustomerConversationBriefEvent = AIConversationEvent & {
  actor?: string | null;
  leadTitle?: string | null;
  source?: "communication" | "email" | "call" | "note" | "website" | "document";
  status?: string | null;
};

export type CustomerConversationBriefDocument = {
  createdAt?: string | null;
  direction?: string | null;
  fileName: string;
  mimeType?: string | null;
  relationship?: string | null;
  summary?: string | null;
};

export type AIReplyTone = "direct" | "friendly" | "professional";

export function aiDraftStyleGuide(tone: AIReplyTone) {
  const toneProfile = {
    direct: [
      "Use short, plain sentences.",
      "Lead with the action or answer.",
      "Avoid filler, apologies and over-explaining.",
    ],
    friendly: [
      "Sound warm and conversational without being chatty.",
      "Use natural phrasing and light reassurance.",
      "Contractions are fine where they sound human.",
    ],
    professional: [
      "Sound calm, clear and commercially professional.",
      "Be polite, specific and concise.",
      "Avoid stiff corporate wording.",
    ],
  }[tone];

  return {
    channelRules: {
      email: [
        "Email must not be a copy of the SMS draft.",
        "Use a useful subject line and 2-4 short paragraphs.",
        "Include a greeting, a brief acknowledgement of the latest customer message, the next step, and a natural sign-off when owner details are available.",
        "Email can include a little more context than SMS, but should still be easy to scan.",
      ],
      phone: [
        "Phone script should be a short talk track for the agent, not customer-facing copy.",
        "Include an opening line, the point to confirm, and the next action.",
      ],
      sms: [
        "SMS must be a short customer-facing text, not an internal note.",
        "Use 1-2 sentences, normally under 320 characters.",
        "Ask one clear question or offer one clear next action.",
        "Do not duplicate the email body.",
        "Avoid sign-offs, timezone labels, em dashes and CRM phrasing unless essential.",
      ],
    },
    selectedTone: tone,
    toneProfile,
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type CustomerConversationBriefInput = {
  currentDate?: Date;
  customer: {
    company?: string | null;
    emailPresent?: boolean | null;
    name?: string | null;
    phonePresent?: boolean | null;
  };
  documents?: CustomerConversationBriefDocument[];
  events: CustomerConversationBriefEvent[];
  lead?: {
    expectedCloseDate?: string | null;
    nextStep?: string | null;
    owner?: string | null;
    products?: unknown;
    stage?: string | null;
    title?: string | null;
    value?: string | null;
  } | null;
  task: string;
  timeZone?: string;
};

function eventTime(value: string | null | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function compactText(value: string | null | undefined, maxLength = 1800) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function documentsFromEmailAttachments({
  attachments,
  createdAt,
  direction,
  relationship,
}: {
  attachments: unknown;
  createdAt?: string | null;
  direction?: string | null;
  relationship?: string | null;
}): CustomerConversationBriefDocument[] {
  if (!Array.isArray(attachments)) return [];

  return attachments.flatMap((attachment) => {
    const item = objectValue(attachment);
    const fileName =
      stringValue(item.filename) ??
      stringValue(item.fileName) ??
      stringValue(item.name);

    if (!fileName) return [];

    return [
      {
        createdAt,
        direction,
        fileName,
        mimeType:
          stringValue(item.contentType) ??
          stringValue(item.content_type) ??
          stringValue(item.mimeType),
        relationship,
        summary:
          stringValue(item.summary) ??
          stringValue(item.description) ??
          "Attachment metadata is available, but no extracted document text is stored.",
      },
    ];
  });
}

export function fileAssetToBriefDocument(file: {
  createdAt: Date;
  entityType?: string | null;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}) {
  return {
    createdAt: file.createdAt.toISOString(),
    fileName: file.originalName,
    mimeType: file.mimeType,
    relationship: file.entityType ?? "CRM file",
    summary: `CRM file metadata only. Size: ${file.sizeBytes} bytes.`,
  } satisfies CustomerConversationBriefDocument;
}

function formatEvent(event: CustomerConversationBriefEvent, index: number) {
  const pieces = [
    `${index + 1}. ${event.occurredAt ?? "Unknown date"}`,
    event.channel ? `[${event.channel}]` : null,
    event.direction ? event.direction.toLowerCase() : null,
    event.actor || event.user ? `by ${event.actor ?? event.user}` : null,
    event.leadTitle ? `lead: ${event.leadTitle}` : null,
    event.status ? `status: ${event.status}` : null,
  ].filter(Boolean);
  const heading = pieces.join(" | ");
  const title = [event.subject, event.summary]
    .map((item) => compactText(item, 400))
    .filter(Boolean)
    .join(" - ");
  const body = compactText(event.body, 1600);

  return [heading, title ? `Summary: ${title}` : null, body ? `Content: ${body}` : null]
    .filter(Boolean)
    .join("\n");
}

function formatDocument(document: CustomerConversationBriefDocument, index: number) {
  const detail = [
    `${index + 1}. ${document.fileName}`,
    document.createdAt ? `date: ${document.createdAt}` : null,
    document.direction ? `direction: ${document.direction.toLowerCase()}` : null,
    document.relationship ? `source: ${document.relationship}` : null,
    document.mimeType ? `type: ${document.mimeType}` : null,
  ].filter(Boolean);
  const summary = compactText(document.summary, 900);
  return [detail.join(" | "), summary ? `Summary: ${summary}` : null]
    .filter(Boolean)
    .join("\n");
}

function buildConversationDocument({
  chronologicalEvents,
  documents,
  input,
  replyTarget,
}: {
  chronologicalEvents: CustomerConversationBriefEvent[];
  documents: CustomerConversationBriefDocument[];
  input: CustomerConversationBriefInput;
  replyTarget: ReturnType<typeof buildAIConversationContext>["replyFocus"];
}) {
  const lines = [
    "# Customer Conversation Brief",
    "",
    "## Current Task",
    input.task,
    "",
    "## Latest Inbound Customer Message To Reply To",
    replyTarget
      ? formatEvent(
          {
            ...replyTarget,
            source: "communication",
          },
          0,
        )
      : "No inbound customer message was found. Do not imply that the customer said something recent.",
    "",
    "## Customer And Lead Context",
    `Customer: ${input.customer.name ?? "Unknown"}`,
    input.customer.company ? `Company: ${input.customer.company}` : null,
    input.lead?.title ? `Lead: ${input.lead.title}` : null,
    input.lead?.stage ? `Stage: ${input.lead.stage}` : null,
    input.lead?.value ? `Value: ${input.lead.value}` : null,
    input.lead?.nextStep ? `CRM next step: ${input.lead.nextStep}` : null,
    "",
    "## Known Customer Constraints",
    replyTarget?.temporalContext.mentionedWeekdays.length
      ? `Mentioned weekdays: ${replyTarget.temporalContext.mentionedWeekdays.join(", ")}`
      : "Mentioned weekdays: none detected",
    replyTarget?.temporalContext.mentionedRelativeDates.length
      ? `Relative dates: ${replyTarget.temporalContext.mentionedRelativeDates.join(", ")}`
      : "Relative dates: none detected",
    replyTarget?.temporalContext.mentionedTimes.length
      ? `Mentioned times: ${replyTarget.temporalContext.mentionedTimes.join(", ")}`
      : "Mentioned times: none detected",
    replyTarget?.temporalContext.requestedDateOptions.length
      ? `Date options implied by customer: ${replyTarget.temporalContext.requestedDateOptions
          .map((option) => `${option.weekday} ${option.date ?? option.display}`)
          .join(", ")}`
      : null,
    replyTarget?.commercialContext.mentionsMeeting
      ? "Customer message relates to booking/availability/call scheduling."
      : null,
    replyTarget?.commercialContext.mentionsPositiveIntent
      ? "Customer message contains positive intent or acceptance."
      : null,
    "",
    "## Chronological Conversation",
    chronologicalEvents.length
      ? chronologicalEvents.map(formatEvent).join("\n\n")
      : "No conversation items available.",
    "",
    "## Documents And Attachments",
    documents.length
      ? documents.map(formatDocument).join("\n\n")
      : "No documents or attachments are recorded in this CRM context.",
  ].filter((line): line is string => typeof line === "string");

  return lines.join("\n");
}

export function buildCustomerConversationBrief(
  input: CustomerConversationBriefInput,
) {
  const conversationIntelligence = buildAIConversationContext({
    currentDate: input.currentDate,
    events: input.events,
    timeZone: input.timeZone,
  });
  const chronologicalEvents = [...input.events]
    .sort((left, right) => eventTime(left.occurredAt) - eventTime(right.occurredAt))
    .slice(-30);
  const documents = [...(input.documents ?? [])]
    .sort((left, right) => eventTime(left.createdAt) - eventTime(right.createdAt))
    .slice(-12);
  const conversationDocument = buildConversationDocument({
    chronologicalEvents,
    documents,
    input,
    replyTarget: conversationIntelligence.replyFocus,
  });
  const rules = [
    "Use the Latest Inbound Customer Message To Reply To as the direct target.",
    "Read the Chronological Conversation oldest-to-newest before drafting.",
    "Use Customer And Lead Context as supporting facts only.",
    "Do not offer dates, days or times that contradict Known Customer Constraints.",
    "If the customer has accepted a day but not a time, propose times only on that accepted day.",
    "Write SMS drafts like a human sales follow-up, not like internal CRM notes.",
    "For SMS, do not say phrases like 'I offered', 'the customer said' or repeat the constraint as a status update.",
    "For SMS, use one clear next question, natural wording and no more than two time options unless the customer asked for more.",
    "Avoid timezone labels, stage names and system phrasing in customer-facing drafts unless essential.",
  ];

  return {
    conversationDocument,
    conversationIntelligence,
    chronologicalConversation: chronologicalEvents,
    documents,
    promptContext: {
      documentItemCounts: {
        conversationItems: chronologicalEvents.length,
        documents: documents.length,
      },
      localNow: conversationIntelligence.localNow,
      replyFocus: conversationIntelligence.replyFocus,
      rules,
      salesBestPractice: conversationIntelligence.salesBestPractice,
      task: input.task,
    },
    rules,
    task: input.task,
  };
}
