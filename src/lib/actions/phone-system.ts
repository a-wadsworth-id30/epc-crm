"use server";

import twilio from "twilio";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto/secrets";
import {
  twilioProvider,
  twilioRecordingSettingsSchema,
  twilioStoredConfigSchema,
} from "@/lib/integrations/twilio";
import {
  getPhoneSystemConfig,
  savePhoneSystemConfig,
  type PhoneSystemAgentSettings,
  type PhoneSystemQueue,
  type PhoneSystemRoutingFlow,
  type PhoneSystemRoutingRule,
} from "@/lib/phone-system/config";
import { prisma } from "@/lib/prisma";
import { queueTranscriptForCallLog } from "@/lib/telephony/transcripts";
import {
  conditionConfigFromNodeData,
  routingConditionOptions,
} from "@/lib/telephony/routing-conditions";

type PhoneSystemActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const staffTelephonySchema = z.object({
  userId: z.string().min(1),
  voiceRoutingMode: z.enum(["BROWSER", "MOBILE", "LANDLINE", "SIP", "FLEX"]),
  voiceAvailability: z.enum(["AVAILABLE", "BUSY", "AWAY", "OFFLINE"]),
  voiceExtension: z.string().trim().optional().default(""),
  mobile: z.string().trim().optional().default(""),
  landline: z.string().trim().optional().default(""),
  sipAddress: z.string().trim().optional().default(""),
});

const singleAgentSettingsSchema = staffTelephonySchema.extend({
  maxConcurrentCalls: z
    .string()
    .trim()
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(10)),
  awayReason: z.string().trim().optional().default(""),
  forceUnavailable: z.boolean(),
  queueIds: z.array(z.string()).default([]),
});

const recordingSettingsFormSchema = z.object({
  enabled: z.boolean(),
  transcriptEnabled: z.boolean(),
  aiAnalysisEnabled: z.boolean(),
  retentionDays: z
    .string()
    .trim()
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(3650)),
  notice: z.string().trim().min(10).max(240),
});

const ringStrategies = ["SIMULTANEOUS", "ROUND_ROBIN", "PRIORITY"] as const;
const ruleRingStrategies = ["QUEUE_DEFAULT", ...ringStrategies] as const;
const fallbackDestinations = [
  "MISSED_CALL_TASK",
  "VOICEMAIL",
  "QUEUE",
  "HANGUP",
] as const;
const ruleFallbackDestinations = [
  "QUEUE_DEFAULT",
  "MISSED_CALL_TASK",
  "VOICEMAIL",
  "QUEUE",
] as const;
const routingFlowNodeTypes = [
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
] as const;
const routingFlowPayloadSchema = z.object({
  rules: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1),
      enabled: z.boolean(),
      priority: z.number().int().min(1),
      condition: z.string().trim().min(1),
      queueId: z.string().min(1),
      ringStrategy: z.enum(ruleRingStrategies),
      timeoutSeconds: z.number().int().min(5).max(3600),
      fallbackDestination: z.enum(ruleFallbackDestinations),
      fallbackQueueId: z.string().nullable(),
    }),
  ),
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(routingFlowNodeTypes),
      x: z.number(),
      y: z.number(),
      data: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
  edges: z
    .array(
      z.object({
        id: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        fromHandle: z.string().min(1),
        label: z.string(),
      }),
    )
    .default([]),
});
type RoutingFlowPayload = z.infer<typeof routingFlowPayloadSchema>;
const idSlugSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
  )
  .pipe(z.string().min(1));

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function numberValue(formData: FormData, name: string, fallback: number) {
  const value = Number(formData.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function enumValue<T extends readonly string[]>(
  values: T,
  value: string,
  fallback: T[number],
): T[number] {
  return values.includes(value) ? (value as T[number]) : fallback;
}

function uniqueId(base: string, existingIds: string[]) {
  let candidate = base;
  let counter = 2;

  while (existingIds.includes(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function routingNodeLabel(node: RoutingFlowPayload["nodes"][number]) {
  const label = node.data.label;
  return typeof label === "string" && label.trim() ? label.trim() : node.id;
}

function isRoutingTerminalNode(node: RoutingFlowPayload["nodes"][number]) {
  return node.type === "END_CALL" || node.type === "NO_MATCH";
}

function isRoutingConditionNode(node: RoutingFlowPayload["nodes"][number]) {
  return (
    node.type === "IF_ELSE" ||
    node.type === "CONTACT_IN_OPEN_SALE" ||
    node.type === "BUSINESS_HOURS" ||
    node.type === "DATE_RULE" ||
    node.type === "TIME_RULE" ||
    node.type === "RULE"
  );
}

function isRoutingRingNode(node: RoutingFlowPayload["nodes"][number]) {
  return (
    node.type === "RING_TEAM" ||
    node.type === "ROUTE_TO" ||
    node.type === "ROUTE_TO_SALE_AGENT" ||
    node.type === "QUEUE"
  );
}

function routingConditionRequiresValue(type: string) {
  return Boolean(
    routingConditionOptions.find((option) => option.type === type)
      ?.requiresValue,
  );
}

function validateRoutingFlow(payload: RoutingFlowPayload) {
  const issues: string[] = [];
  const nodesById = new Map(payload.nodes.map((node) => [node.id, node]));
  const edgesByFrom = new Map<string, RoutingFlowPayload["edges"]>();

  for (const edge of payload.edges) {
    edgesByFrom.set(edge.from, [...(edgesByFrom.get(edge.from) ?? []), edge]);

    if (!nodesById.has(edge.from)) {
      issues.push(`Connection ${edge.id} starts from a missing node.`);
    }
    if (!nodesById.has(edge.to)) {
      issues.push(`Connection ${edge.id} points to a missing node.`);
    }
  }

  const startNodes = payload.nodes.filter(
    (node) => node.type === "INBOUND_CALL" || node.type === "START",
  );
  if (startNodes.length !== 1) {
    issues.push("Routing flow must have exactly one inbound call start node.");
  }

  for (const node of payload.nodes) {
    const outgoing = edgesByFrom.get(node.id) ?? [];
    const label = routingNodeLabel(node);

    if (isRoutingConditionNode(node)) {
      if (node.type === "IF_ELSE" || node.type === "RULE") {
        const hasStructuredCondition =
          typeof node.data.conditionType === "string" &&
          node.data.conditionType.trim().length > 0;

        if (hasStructuredCondition) {
          const condition = conditionConfigFromNodeData(node.data);

          if (!condition) {
            issues.push(`${label} has an invalid condition type.`);
          } else if (
            routingConditionRequiresValue(condition.type) &&
            !String(condition.value ?? "").trim()
          ) {
            issues.push(`${label} needs a condition match value.`);
          }
        }
      }

      if (!outgoing.some((edge) => edge.fromHandle === "yes")) {
        issues.push(`${label} needs a Yes destination.`);
      }
      if (!outgoing.some((edge) => edge.fromHandle === "no")) {
        issues.push(`${label} needs a No destination.`);
      }
    } else if (isRoutingRingNode(node)) {
      if (
        node.type === "ROUTE_TO" &&
        node.data.routeTarget === "INDIVIDUAL" &&
        typeof node.data.userId !== "string"
      ) {
        issues.push(`${label} needs an individual.`);
      }
      if (!outgoing.some((edge) => edge.fromHandle === "no_answer")) {
        issues.push(`${label} needs a no-answer destination.`);
      }
    } else if (!isRoutingTerminalNode(node) && outgoing.length === 0) {
      issues.push(`${label} needs a next destination.`);
    }
  }

  const startNode = startNodes[0];
  if (startNode) {
    const reachable = new Set<string>();
    const stack = [startNode.id];

    while (stack.length) {
      const nodeId = stack.pop();
      if (!nodeId || reachable.has(nodeId)) continue;
      reachable.add(nodeId);

      for (const edge of edgesByFrom.get(nodeId) ?? []) {
        if (nodesById.has(edge.to)) {
          stack.push(edge.to);
        }
      }
    }

    for (const node of payload.nodes) {
      if (!reachable.has(node.id)) {
        issues.push(
          `${routingNodeLabel(node)} is not reachable from inbound call.`,
        );
      }
    }
  }

  for (const node of payload.nodes) {
    if (isRoutingTerminalNode(node)) continue;

    const visited = new Set<string>();
    const stack = [node.id];
    let reachesTerminal = false;

    while (stack.length) {
      const nodeId = stack.pop();
      if (!nodeId || visited.has(nodeId)) continue;
      visited.add(nodeId);

      const current = nodesById.get(nodeId);
      if (current && isRoutingTerminalNode(current)) {
        reachesTerminal = true;
        break;
      }

      for (const edge of edgesByFrom.get(nodeId) ?? []) {
        if (nodesById.has(edge.to)) {
          stack.push(edge.to);
        }
      }
    }

    if (!reachesTerminal) {
      issues.push(
        `${routingNodeLabel(node)} does not lead to an end-call path.`,
      );
    }
  }

  return [...new Set(issues)];
}

export async function updateStaffTelephonyAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;

  await requireAdmin();

  const parsed = staffTelephonySchema.safeParse({
    userId: formData.get("userId"),
    voiceRoutingMode: formData.get("voiceRoutingMode"),
    voiceAvailability: formData.get("voiceAvailability"),
    voiceExtension: formData.get("voiceExtension"),
    mobile: formData.get("mobile"),
    landline: formData.get("landline"),
    sipAddress: formData.get("sipAddress"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid phone settings.",
      savedAt: null,
    };
  }

  const {
    userId,
    voiceRoutingMode,
    voiceAvailability,
    voiceExtension,
    mobile,
    landline,
    sipAddress,
  } = parsed.data;

  await prisma.user.update({
    where: { id: userId },
    data: {
      voiceRoutingMode,
      voiceAvailability,
      voiceLastSeenAt: new Date(),
      voiceExtension: voiceExtension || null,
      mobile: mobile || null,
      landline: landline || null,
      sipAddress: sipAddress || null,
    },
  });

  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Staff phone settings saved.",
    savedAt: Date.now(),
  };
}

export async function updateSingleAgentSettingsAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;

  await requireAdmin();

  const parsed = singleAgentSettingsSchema.safeParse({
    userId: formData.get("userId"),
    voiceRoutingMode: formData.get("voiceRoutingMode"),
    voiceAvailability: formData.get("voiceAvailability"),
    voiceExtension: formData.get("voiceExtension"),
    mobile: formData.get("mobile"),
    landline: formData.get("landline"),
    sipAddress: formData.get("sipAddress"),
    maxConcurrentCalls: formData.get("maxConcurrentCalls"),
    awayReason: formData.get("awayReason"),
    forceUnavailable: formData.get("forceUnavailable") === "on",
    queueIds: formData.getAll("queueIds").map(String),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid agent settings.",
      savedAt: null,
    };
  }

  const {
    awayReason,
    forceUnavailable,
    landline,
    maxConcurrentCalls,
    mobile,
    queueIds,
    sipAddress,
    userId,
    voiceAvailability,
    voiceExtension,
    voiceRoutingMode,
  } = parsed.data;
  const config = await getPhoneSystemConfig();
  const knownQueueIds = new Set(config.queues.map((queue) => queue.id));
  const assignedQueueIds = [
    ...new Set(queueIds.filter((queueId) => knownQueueIds.has(queueId))),
  ];
  const existingSettings = config.agentSettings.filter(
    (settings) => settings.userId !== userId,
  );

  await prisma.user.update({
    where: { id: userId },
    data: {
      voiceRoutingMode,
      voiceAvailability,
      voiceLastSeenAt: new Date(),
      voiceExtension: voiceExtension || null,
      mobile: mobile || null,
      landline: landline || null,
      sipAddress: sipAddress || null,
    },
  });

  await savePhoneSystemConfig({
    ...config,
    agentSettings: [
      ...existingSettings,
      {
        userId,
        assignedQueueIds,
        maxConcurrentCalls,
        forceUnavailable,
        awayReason,
      },
    ],
  });

  revalidatePath("/telephony");
  revalidatePath("/telephony/users");

  return {
    ok: true,
    message: "Agent settings saved.",
    savedAt: Date.now(),
  };
}

export async function updateCallRecordingSettingsAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;

  await requireAdmin();

  const parsed = recordingSettingsFormSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    transcriptEnabled: formData.get("transcriptEnabled") === "on",
    aiAnalysisEnabled: formData.get("aiAnalysisEnabled") === "on",
    retentionDays: formData.get("retentionDays"),
    notice: formData.get("notice"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid recording settings.",
      savedAt: null,
    };
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const config = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!connection || !config.success) {
    return {
      ok: false,
      message: "Connect Twilio before changing call recording settings.",
      savedAt: null,
    };
  }

  const recording = twilioRecordingSettingsSchema.parse(parsed.data);

  await prisma.integrationConnection.update({
    where: { provider: twilioProvider },
    data: {
      config: JSON.parse(
        JSON.stringify({
          ...config.data,
          recording,
        }),
      ),
    },
  });

  revalidatePath("/telephony");
  revalidatePath("/settings/integrations/twilio");

  return {
    ok: true,
    message: "Call recording and transcript settings saved.",
    savedAt: Date.now(),
  };
}

export async function updateBusinessHoursAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  await requireAdmin();

  const config = await getPhoneSystemConfig();
  const weekly = config.businessHours.weekly.map((day) => ({
    ...day,
    open: checked(formData, `day-${day.day}-open`),
    start: text(formData, `day-${day.day}-start`) || day.start,
    end: text(formData, `day-${day.day}-end`) || day.end,
  }));
  const holidayLines = text(formData, "holidays")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const holidays = holidayLines.map((line, index) => {
    const [date = "", name = "Closure"] = line
      .split("|")
      .map((part) => part.trim());

    return {
      id: `holiday-${date || index}`,
      name: name || "Closure",
      date,
      closed: true,
      start: null,
      end: null,
    };
  });

  await savePhoneSystemConfig({
    ...config,
    businessHours: {
      ...config.businessHours,
      timezone: text(formData, "timezone") || config.businessHours.timezone,
      weekly,
      holidays,
      afterHours: {
        destination: enumValue(
          fallbackDestinations,
          text(formData, "afterHoursDestination"),
          "MISSED_CALL_TASK",
        ),
        queueId: text(formData, "afterHoursQueueId") || null,
        voicemailMessage:
          text(formData, "voicemailMessage") ||
          config.businessHours.afterHours.voicemailMessage,
        notificationEmail: text(formData, "notificationEmail"),
        createTask: checked(formData, "createTask"),
      },
    },
  });

  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Business hours and after-hours routing saved.",
    savedAt: Date.now(),
  };
}

export async function updateQueuesAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  await requireAdmin();

  const config = await getPhoneSystemConfig();
  const queueIds = formData.getAll("queueId").map(String);
  const queues: PhoneSystemQueue[] = queueIds.map((id, index) => {
    const existing =
      config.queues.find((queue) => queue.id === id) ?? config.queues[index];

    return {
      id,
      name: text(formData, `queue-${id}-name`) || existing?.name || id,
      enabled: checked(formData, `queue-${id}-enabled`),
      priority: numberValue(formData, `queue-${id}-priority`, index + 1),
      ringStrategy: enumValue(
        ringStrategies,
        text(formData, `queue-${id}-ringStrategy`),
        "SIMULTANEOUS",
      ),
      holdAudio: enumValue(
        ["RING", "MUSIC"] as const,
        text(formData, `queue-${id}-holdAudio`),
        "RING",
      ),
      slaSeconds: numberValue(formData, `queue-${id}-slaSeconds`, 25),
      overflowSeconds: numberValue(formData, `queue-${id}-overflowSeconds`, 25),
      fallbackDestination: enumValue(
        fallbackDestinations,
        text(formData, `queue-${id}-fallbackDestination`),
        "MISSED_CALL_TASK",
      ),
      fallbackQueueId: text(formData, `queue-${id}-fallbackQueueId`) || null,
      businessHoursProfileId: "default",
      assignedAgentIds: formData.getAll(`queue-${id}-agentIds`).map(String),
      recording: {
        enabled: checked(formData, `queue-${id}-recording`),
        transcriptEnabled: checked(formData, `queue-${id}-transcripts`),
        aiAnalysisEnabled: checked(formData, `queue-${id}-ai`),
      },
    };
  });

  await savePhoneSystemConfig({ ...config, queues });
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Teams, agents, overflow and recording policy saved.",
    savedAt: Date.now(),
  };
}

export async function createPhoneQueueAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  await requireAdmin();

  const name = text(formData, "queueName");
  const parsedId = idSlugSchema.safeParse(name);

  if (!name || !parsedId.success) {
    return {
      ok: false,
      message: "Enter a team name.",
      savedAt: null,
    };
  }

  const config = await getPhoneSystemConfig();
  const id = uniqueId(
    parsedId.data,
    config.queues.map((queue) => queue.id),
  );
  const nextPriority =
    config.queues.reduce((max, queue) => Math.max(max, queue.priority), 0) + 1;
  const nextQueue: PhoneSystemQueue = {
    id,
    name,
    enabled: true,
    priority: nextPriority,
    ringStrategy: "SIMULTANEOUS",
    holdAudio: "RING",
    slaSeconds: 25,
    overflowSeconds: 25,
    fallbackDestination: "MISSED_CALL_TASK",
    fallbackQueueId: null,
    businessHoursProfileId: "default",
    assignedAgentIds: [],
    recording: {
      enabled: true,
      transcriptEnabled: true,
      aiAnalysisEnabled: true,
    },
  };

  await savePhoneSystemConfig({
    ...config,
    queues: [...config.queues, nextQueue],
  });
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Queue created.",
    savedAt: Date.now(),
  };
}

export async function deletePhoneQueueAction(
  queueId: string,
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  void formData;
  await requireAdmin();

  const config = await getPhoneSystemConfig();

  if (!queueId) {
    return {
      ok: false,
      message: "Choose a queue to delete.",
      savedAt: null,
    };
  }

  if (config.queues.length <= 1) {
    return {
      ok: false,
      message: "At least one queue is required.",
      savedAt: null,
    };
  }

  const remainingQueues = config.queues.filter((queue) => queue.id !== queueId);
  const fallbackQueueId = remainingQueues[0]?.id ?? null;

  await savePhoneSystemConfig({
    ...config,
    queues: remainingQueues,
    routingRules: config.routingRules.map((rule) => ({
      ...rule,
      queueId:
        rule.queueId === queueId
          ? (fallbackQueueId ?? rule.queueId)
          : rule.queueId,
      fallbackQueueId:
        rule.fallbackQueueId === queueId
          ? fallbackQueueId
          : rule.fallbackQueueId,
    })),
    agentSettings: config.agentSettings.map((agent) => ({
      ...agent,
      assignedQueueIds: agent.assignedQueueIds.filter((id) => id !== queueId),
    })),
    businessHours: {
      ...config.businessHours,
      afterHours: {
        ...config.businessHours.afterHours,
        queueId:
          config.businessHours.afterHours.queueId === queueId
            ? fallbackQueueId
            : config.businessHours.afterHours.queueId,
      },
    },
  });
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Queue deleted and dependent routing updated.",
    savedAt: Date.now(),
  };
}

export async function updateRoutingRulesAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  await requireAdmin();

  const config = await getPhoneSystemConfig();
  const ruleIds = formData.getAll("ruleId").map(String);
  const routingRules: PhoneSystemRoutingRule[] = ruleIds.map((id, index) => {
    const existing =
      config.routingRules.find((rule) => rule.id === id) ??
      config.routingRules[index];

    return {
      id,
      name: text(formData, `rule-${id}-name`) || existing?.name || id,
      enabled: checked(formData, `rule-${id}-enabled`),
      priority: numberValue(formData, `rule-${id}-priority`, index + 1),
      condition:
        text(formData, `rule-${id}-condition`) || existing?.condition || "",
      queueId:
        text(formData, `rule-${id}-queueId`) || existing?.queueId || "sales",
      ringStrategy: enumValue(
        ruleRingStrategies,
        text(formData, `rule-${id}-ringStrategy`),
        "QUEUE_DEFAULT",
      ),
      timeoutSeconds: numberValue(formData, `rule-${id}-timeoutSeconds`, 25),
      fallbackDestination: enumValue(
        ruleFallbackDestinations,
        text(formData, `rule-${id}-fallbackDestination`),
        "QUEUE_DEFAULT",
      ),
      fallbackQueueId: text(formData, `rule-${id}-fallbackQueueId`) || null,
    };
  });

  await savePhoneSystemConfig({ ...config, routingRules });
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Routing rules saved.",
    savedAt: Date.now(),
  };
}

export async function updateRoutingFlowAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  await requireAdmin();

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(
      text(formData, "routingFlowPayload") || "{}",
    ) as unknown;
  } catch {
    return {
      ok: false,
      message: "Invalid routing flow payload.",
      savedAt: null,
    };
  }

  const parsed = routingFlowPayloadSchema.safeParse(parsedJson);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid routing flow.",
      savedAt: null,
    };
  }

  const flowIssues = validateRoutingFlow(parsed.data);

  if (flowIssues.length) {
    return {
      ok: false,
      message: `Fix routing flow before publishing: ${flowIssues[0]}`,
      savedAt: null,
    };
  }

  const config = await getPhoneSystemConfig();
  const queueIds = new Set(config.queues.map((queue) => queue.id));
  const routingRules: PhoneSystemRoutingRule[] = parsed.data.rules
    .map((rule, index) => ({
      ...rule,
      priority: index + 1,
      fallbackQueueId:
        rule.fallbackDestination === "QUEUE" &&
        rule.fallbackQueueId &&
        queueIds.has(rule.fallbackQueueId)
          ? rule.fallbackQueueId
          : null,
    }))
    .filter((rule) => queueIds.has(rule.queueId));

  if (!routingRules.length) {
    return {
      ok: false,
      message: "Add at least one routing rule connected to a valid call group.",
      savedAt: null,
    };
  }

  const routingFlow: PhoneSystemRoutingFlow = {
    version: 2,
    nodes: parsed.data.nodes,
    edges: parsed.data.edges,
    updatedAt: new Date().toISOString(),
  };

  await savePhoneSystemConfig({ ...config, routingRules, routingFlow });
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Routing flow saved.",
    savedAt: Date.now(),
  };
}

export async function createPhoneRoutingRuleAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  await requireAdmin();

  const name = text(formData, "ruleName");
  const parsedId = idSlugSchema.safeParse(name);
  const config = await getPhoneSystemConfig();
  const defaultQueueId = config.queues[0]?.id;

  if (!name || !parsedId.success || !defaultQueueId) {
    return {
      ok: false,
      message:
        "Enter a routing rule name and make sure at least one queue exists.",
      savedAt: null,
    };
  }

  const id = uniqueId(
    parsedId.data,
    config.routingRules.map((rule) => rule.id),
  );
  const nextPriority =
    config.routingRules.reduce((max, rule) => Math.max(max, rule.priority), 0) +
    1;
  const nextRule: PhoneSystemRoutingRule = {
    id,
    name,
    enabled: true,
    priority: nextPriority,
    condition: "New routing condition",
    queueId: defaultQueueId,
    ringStrategy: "QUEUE_DEFAULT",
    timeoutSeconds: 25,
    fallbackDestination: "QUEUE_DEFAULT",
    fallbackQueueId: null,
  };

  await savePhoneSystemConfig({
    ...config,
    routingRules: [...config.routingRules, nextRule],
  });
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Routing rule created.",
    savedAt: Date.now(),
  };
}

export async function deletePhoneRoutingRuleAction(
  ruleId: string,
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  void formData;
  await requireAdmin();

  const config = await getPhoneSystemConfig();

  if (!ruleId) {
    return {
      ok: false,
      message: "Choose a routing rule to delete.",
      savedAt: null,
    };
  }

  if (config.routingRules.length <= 1) {
    return {
      ok: false,
      message: "At least one routing rule is required.",
      savedAt: null,
    };
  }

  await savePhoneSystemConfig({
    ...config,
    routingRules: config.routingRules.filter((rule) => rule.id !== ruleId),
  });
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Routing rule deleted.",
    savedAt: Date.now(),
  };
}

export async function updateAgentRoutingSettingsAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  await requireAdmin();

  const config = await getPhoneSystemConfig();
  const userIds = formData.getAll("userId").map(String);
  const agentSettings: PhoneSystemAgentSettings[] = userIds.map((userId) => ({
    userId,
    assignedQueueIds: formData.getAll(`agent-${userId}-queueIds`).map(String),
    maxConcurrentCalls: numberValue(
      formData,
      `agent-${userId}-maxConcurrentCalls`,
      1,
    ),
    forceUnavailable: checked(formData, `agent-${userId}-forceUnavailable`),
    awayReason: text(formData, `agent-${userId}-awayReason`),
  }));

  await savePhoneSystemConfig({ ...config, agentSettings });
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Agent routing settings saved.",
    savedAt: Date.now(),
  };
}

export async function queueCallTranscriptAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  await requireAdmin();

  const callLogId = text(formData, "callLogId");

  if (!callLogId) {
    return {
      ok: false,
      message: "Choose a call recording.",
      savedAt: null,
    };
  }

  const callLog = await prisma.callLog.findUnique({ where: { id: callLogId } });

  if (!callLog?.recordingSid && !callLog?.recordingUrl) {
    return {
      ok: false,
      message: "This call does not have a recording to transcribe.",
      savedAt: null,
    };
  }

  const result = await queueTranscriptForCallLog(callLog.id, true);

  revalidatePath("/telephony");

  return {
    ok: result.ok,
    message: result.message,
    savedAt: Date.now(),
  };
}

export async function deleteCallRecordingAction(
  previousState: PhoneSystemActionState,
  formData: FormData,
): Promise<PhoneSystemActionState> {
  void previousState;
  await requireAdmin();

  const callLogId = text(formData, "callLogId");

  if (!callLogId) {
    return {
      ok: false,
      message: "Choose a call recording.",
      savedAt: null,
    };
  }

  const callLog = await prisma.callLog.findUnique({ where: { id: callLogId } });

  if (!callLog?.recordingSid) {
    return {
      ok: false,
      message: "This call does not have a Twilio recording SID.",
      savedAt: null,
    };
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const config = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!config.success || !config.data.credentials?.authToken) {
    return {
      ok: false,
      message: "Twilio credentials are required before deleting a recording.",
      savedAt: null,
    };
  }

  await twilio(
    config.data.accountSid,
    decryptSecret(config.data.credentials.authToken),
  )
    .recordings(callLog.recordingSid)
    .remove();

  const metadata =
    callLog.metadata &&
    typeof callLog.metadata === "object" &&
    !Array.isArray(callLog.metadata)
      ? (callLog.metadata as Record<string, unknown>)
      : {};

  await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      recordingSid: null,
      recordingUrl: null,
      metadata: {
        ...metadata,
        recordingDeletedAt: new Date().toISOString(),
      },
    },
  });

  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Recording deleted from Twilio and removed from the call.",
    savedAt: Date.now(),
  };
}
