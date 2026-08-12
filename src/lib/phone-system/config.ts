import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const phoneSystemProvider = "phone-system";

const daySchema = z.object({
  day: z.number().int().min(0).max(6),
  label: z.string(),
  open: z.boolean(),
  start: z.string(),
  end: z.string(),
});

const recordingPolicySchema = z.object({
  enabled: z.boolean(),
  transcriptEnabled: z.boolean(),
  aiAnalysisEnabled: z.boolean(),
});

const queueSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  ringStrategy: z.enum(["SIMULTANEOUS", "ROUND_ROBIN", "PRIORITY"]),
  holdAudio: z.enum(["RING", "MUSIC"]).default("RING"),
  slaSeconds: z.number().int().min(5).max(3600),
  overflowSeconds: z.number().int().min(5).max(3600),
  fallbackDestination: z.enum(["MISSED_CALL_TASK", "VOICEMAIL", "QUEUE", "HANGUP"]),
  fallbackQueueId: z.string().nullable(),
  businessHoursProfileId: z.string(),
  assignedAgentIds: z.array(z.string()),
  recording: recordingPolicySchema,
});

const routingRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  condition: z.string(),
  queueId: z.string(),
  ringStrategy: z.enum(["QUEUE_DEFAULT", "SIMULTANEOUS", "ROUND_ROBIN", "PRIORITY"]),
  timeoutSeconds: z.number().int().min(5).max(3600),
  fallbackDestination: z.enum(["QUEUE_DEFAULT", "MISSED_CALL_TASK", "VOICEMAIL", "QUEUE"]),
  fallbackQueueId: z.string().nullable(),
});

const routingFlowNodeTypeSchema = z.enum([
  "START",
  "RULE",
  "QUEUE",
  "FALLBACK",
  "NO_MATCH",
  "INBOUND_CALL",
  "IF_ELSE",
  "CONTACT_IN_OPEN_SALE",
  "ROUTE_TO",
  "ROUTE_TO_SALE_AGENT",
  "RING_TEAM",
  "WAIT",
  "VOICEMAIL",
  "REDIRECT",
  "BUSINESS_HOURS",
  "DATE_RULE",
  "TIME_RULE",
  "AUDIO_MESSAGE",
  "IVR_MENU",
  "END_CALL",
]);

const routingFlowNodeSchema = z.object({
  id: z.string(),
  type: routingFlowNodeTypeSchema,
  x: z.number(),
  y: z.number(),
  data: z.record(z.string(), z.unknown()).default({}),
});

const routingFlowEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  fromHandle: z.string(),
  label: z.string(),
});

const routingFlowSchema = z.object({
  version: z.number().int().default(2),
  nodes: z.array(routingFlowNodeSchema).default([]),
  edges: z.array(routingFlowEdgeSchema).default([]),
  updatedAt: z.string().datetime().nullable().default(null),
});

const agentSettingsSchema = z.object({
  userId: z.string(),
  assignedQueueIds: z.array(z.string()),
  maxConcurrentCalls: z.number().int().min(1).max(10),
  forceUnavailable: z.boolean(),
  awayReason: z.string(),
});

const holidaySchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  closed: z.boolean(),
  start: z.string().nullable(),
  end: z.string().nullable(),
});

export const phoneSystemConfigSchema = z.object({
  version: z.number().int().default(1),
  updatedAt: z.string().datetime().nullable().default(null),
  businessHours: z.object({
    timezone: z.string(),
    weekly: z.array(daySchema),
    holidays: z.array(holidaySchema),
    afterHours: z.object({
      destination: z.enum(["MISSED_CALL_TASK", "VOICEMAIL", "QUEUE", "HANGUP"]),
      queueId: z.string().nullable(),
      voicemailMessage: z.string(),
      notificationEmail: z.string(),
      createTask: z.boolean(),
    }),
  }),
  queues: z.array(queueSchema),
  routingRules: z.array(routingRuleSchema),
  routingFlow: routingFlowSchema.default({
    version: 2,
    nodes: [],
    edges: [],
    updatedAt: null,
  }),
  agentSettings: z.array(agentSettingsSchema),
  recording: z.object({
    storage: z.enum(["TWILIO", "R2"]),
    retentionDays: z.number().int().min(1).max(3650),
    allowDownload: z.boolean(),
    showPrivacyWarning: z.boolean(),
  }),
});

export type PhoneSystemConfig = z.infer<typeof phoneSystemConfigSchema>;
export type PhoneSystemQueue = PhoneSystemConfig["queues"][number];
export type PhoneSystemRoutingRule = PhoneSystemConfig["routingRules"][number];
export type PhoneSystemRoutingFlow = PhoneSystemConfig["routingFlow"];
export type PhoneSystemAgentSettings = PhoneSystemConfig["agentSettings"][number];

const defaultWeekly = [
  ["Mon", true],
  ["Tue", true],
  ["Wed", true],
  ["Thu", true],
  ["Fri", true],
  ["Sat", false],
  ["Sun", false],
].map(([label, open], day) => ({
  day,
  label: String(label),
  open: Boolean(open),
  start: "09:00",
  end: "17:30",
}));

export const defaultPhoneSystemConfig: PhoneSystemConfig = {
  version: 1,
  updatedAt: null,
  businessHours: {
    timezone: "Europe/London",
    weekly: defaultWeekly,
    holidays: [],
    afterHours: {
      destination: "MISSED_CALL_TASK",
      queueId: null,
      voicemailMessage:
        "Sorry, the team is unavailable. Please leave a message and we will call you back.",
      notificationEmail: "",
      createTask: true,
    },
  },
  queues: [
    {
      id: "sales",
      name: "Sales",
      enabled: true,
      priority: 1,
      ringStrategy: "SIMULTANEOUS",
      holdAudio: "RING",
      slaSeconds: 25,
      overflowSeconds: 25,
      fallbackDestination: "VOICEMAIL",
      fallbackQueueId: null,
      businessHoursProfileId: "default",
      assignedAgentIds: [],
      recording: { enabled: true, transcriptEnabled: true, aiAnalysisEnabled: true },
    },
    {
      id: "website-enquiry",
      name: "New business",
      enabled: true,
      priority: 2,
      ringStrategy: "PRIORITY",
      holdAudio: "RING",
      slaSeconds: 20,
      overflowSeconds: 25,
      fallbackDestination: "MISSED_CALL_TASK",
      fallbackQueueId: "sales",
      businessHoursProfileId: "default",
      assignedAgentIds: [],
      recording: { enabled: true, transcriptEnabled: true, aiAnalysisEnabled: true },
    },
    {
      id: "existing-clients",
      name: "Customer success",
      enabled: true,
      priority: 3,
      ringStrategy: "PRIORITY",
      holdAudio: "RING",
      slaSeconds: 30,
      overflowSeconds: 30,
      fallbackDestination: "QUEUE",
      fallbackQueueId: "sales",
      businessHoursProfileId: "default",
      assignedAgentIds: [],
      recording: { enabled: true, transcriptEnabled: true, aiAnalysisEnabled: true },
    },
    {
      id: "support",
      name: "Support",
      enabled: false,
      priority: 4,
      ringStrategy: "ROUND_ROBIN",
      holdAudio: "RING",
      slaSeconds: 30,
      overflowSeconds: 30,
      fallbackDestination: "VOICEMAIL",
      fallbackQueueId: null,
      businessHoursProfileId: "default",
      assignedAgentIds: [],
      recording: { enabled: true, transcriptEnabled: true, aiAnalysisEnabled: true },
    },
  ],
  routingRules: [
    {
      id: "website-enquiry-follow-up",
      name: "Website enquiry follow-up",
      enabled: true,
      priority: 1,
      condition: "Call attribution source is website or linked lead",
      queueId: "website-enquiry",
      ringStrategy: "QUEUE_DEFAULT",
      timeoutSeconds: 25,
      fallbackDestination: "QUEUE_DEFAULT",
      fallbackQueueId: null,
    },
    {
      id: "known-contacts",
      name: "Known contacts",
      enabled: true,
      priority: 2,
      condition: "Caller number matches a CRM contact",
      queueId: "existing-clients",
      ringStrategy: "PRIORITY",
      timeoutSeconds: 30,
      fallbackDestination: "QUEUE",
      fallbackQueueId: "sales",
    },
    {
      id: "general-inbound",
      name: "General inbound",
      enabled: true,
      priority: 3,
      condition: "No source or contact match",
      queueId: "sales",
      ringStrategy: "ROUND_ROBIN",
      timeoutSeconds: 25,
      fallbackDestination: "VOICEMAIL",
      fallbackQueueId: null,
    },
  ],
  routingFlow: {
    version: 2,
    nodes: [],
    edges: [],
    updatedAt: null,
  },
  agentSettings: [],
  recording: {
    storage: "TWILIO",
    retentionDays: 180,
    allowDownload: true,
    showPrivacyWarning: true,
  },
};

function mergeConfig(value: unknown): PhoneSystemConfig {
  const parsed = phoneSystemConfigSchema.safeParse(value ?? {});

  if (parsed.success) {
    return {
      ...defaultPhoneSystemConfig,
      ...parsed.data,
      businessHours: {
        ...defaultPhoneSystemConfig.businessHours,
        ...parsed.data.businessHours,
      },
      queues: parsed.data.queues.length
        ? parsed.data.queues.map(normalizeLegacyQueueName)
        : defaultPhoneSystemConfig.queues,
      routingRules: parsed.data.routingRules.length
        ? parsed.data.routingRules
        : defaultPhoneSystemConfig.routingRules,
      routingFlow: {
        ...defaultPhoneSystemConfig.routingFlow,
        ...parsed.data.routingFlow,
      },
      agentSettings: parsed.data.agentSettings ?? [],
      recording: {
        ...defaultPhoneSystemConfig.recording,
        ...parsed.data.recording,
      },
    };
  }

  return defaultPhoneSystemConfig;
}

function normalizeLegacyQueueName(
  queue: PhoneSystemConfig["queues"][number],
): PhoneSystemConfig["queues"][number] {
  if (queue.id === "website-enquiry" && queue.name === "Website enquiry follow-up") {
    return { ...queue, name: "New business" };
  }

  if (queue.id === "existing-clients" && queue.name === "Existing clients") {
    return { ...queue, name: "Customer success" };
  }

  return queue;
}

export async function getPhoneSystemConfig() {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: phoneSystemProvider },
  });

  return mergeConfig(connection?.config);
}

export async function savePhoneSystemConfig(config: PhoneSystemConfig) {
  const nextConfig = phoneSystemConfigSchema.parse({
    ...config,
    updatedAt: new Date().toISOString(),
  });

  await prisma.integrationConnection.upsert({
    where: { provider: phoneSystemProvider },
    update: {
      name: "Phone system",
      description: "CRM telephony routing, queues, hours and recording policy.",
      status: "CONNECTED",
      config: JSON.parse(JSON.stringify(nextConfig)),
    },
    create: {
      provider: phoneSystemProvider,
      name: "Phone system",
      description: "CRM telephony routing, queues, hours and recording policy.",
      status: "CONNECTED",
      config: JSON.parse(JSON.stringify(nextConfig)),
    },
  });

  return nextConfig;
}
