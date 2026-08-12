import "server-only";

import type { Prisma, VoiceRoutingMode } from "@prisma/client";
import {
  getPhoneSystemConfig,
  type PhoneSystemConfig,
  type PhoneSystemQueue,
  type PhoneSystemRoutingRule,
} from "@/lib/phone-system/config";
import { prisma } from "@/lib/prisma";
import {
  browserAvailabilityTtlMs,
  liveCallWhere,
  targetForUser,
} from "@/lib/telephony/twilio-voice";
import { jsonObject, routingAttempts } from "@/lib/telephony/call-routing";
import {
  conditionConfigFromNodeData,
  evaluateRoutingCondition,
  type RoutingConditionContext,
} from "@/lib/telephony/routing-conditions";

type RoutingContext = {
  contactId?: string | null;
  fromNumber?: string | null;
  opportunityId?: string | null;
  opportunitySource?: string | null;
  attribution?: unknown;
  source?: string | null;
  toNumber?: string | null;
  trackingPhoneNumber?: string | null;
};

type RoutingMetadata =
  | Prisma.JsonValue
  | Prisma.InputJsonObject
  | null
  | undefined;

type QueueAgent = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  mobile: string | null;
  landline: string | null;
  sipAddress: string | null;
  voiceExtension: string | null;
  voiceRoutingMode: VoiceRoutingMode;
};

type QueueRingStrategy = PhoneSystemQueue["ringStrategy"];
type RoutingFlowNode = PhoneSystemConfig["routingFlow"]["nodes"][number];
type RoutingFlowEdge = PhoneSystemConfig["routingFlow"]["edges"][number];
type RoutingFlowRuntimeTrigger = "current" | "no_answer";

type IvrRuntimeOption = {
  key: string;
  label: string;
  message: string;
};

export type RoutingFlowRuntimeAction =
  | {
      kind: "queue";
      metadata: Prisma.InputJsonObject;
      nodeId: string;
      nodeLabel: string;
      nodeType: RoutingFlowNode["type"];
      queue: PhoneSystemQueue;
      rule: PhoneSystemRoutingRule | null;
    }
  | {
      kind: "wait";
      metadata: Prisma.InputJsonObject;
      nodeId: string;
      nodeLabel: string;
      nodeType: RoutingFlowNode["type"];
      seconds: number;
      waitUntil: string;
    }
  | {
      kind: "voicemail" | "end";
      metadata: Prisma.InputJsonObject;
      nodeId: string;
      nodeLabel: string;
      nodeType: RoutingFlowNode["type"];
    }
  | {
      kind: "message";
      metadata: Prisma.InputJsonObject;
      message: string;
      nodeId: string;
      nodeLabel: string;
      nodeType: RoutingFlowNode["type"];
    }
  | {
      kind: "ivr";
      audioUrl: string | null;
      language: string;
      metadata: Prisma.InputJsonObject;
      prompt: string;
      promptType: string;
      retryMessage: string;
      voice: string;
      nodeId: string;
      nodeLabel: string;
      nodeType: RoutingFlowNode["type"];
    }
  | {
      kind: "redirect";
      metadata: Prisma.InputJsonObject;
      destination: string;
      nodeId: string;
      nodeLabel: string;
      nodeType: RoutingFlowNode["type"];
    };

function isEnabledQueue(queue: PhoneSystemQueue) {
  return queue.enabled;
}

function queueById(
  config: PhoneSystemConfig,
  queueId: string | null | undefined,
) {
  return (
    config.queues.find((queue) => queue.id === queueId && queue.enabled) ?? null
  );
}

function looksLikeWebsiteLead(
  rule: PhoneSystemRoutingRule,
  context: RoutingContext,
) {
  const haystack = `${rule.id} ${rule.name} ${rule.condition}`.toLowerCase();
  return (
    Boolean(context.attribution || context.trackingPhoneNumber) &&
    (haystack.includes("website") ||
      haystack.includes("attribution") ||
      haystack.includes("lead"))
  );
}

function looksLikeKnownContact(
  rule: PhoneSystemRoutingRule,
  context: RoutingContext,
) {
  const haystack = `${rule.id} ${rule.name} ${rule.condition}`.toLowerCase();
  return (
    Boolean(context.contactId) &&
    (haystack.includes("contact") ||
      haystack.includes("client") ||
      haystack.includes("known"))
  );
}

function matchesRule(rule: PhoneSystemRoutingRule, context: RoutingContext) {
  if (!rule.enabled) return false;
  if (looksLikeWebsiteLead(rule, context)) return true;
  if (looksLikeKnownContact(rule, context)) return true;

  const haystack = `${rule.id} ${rule.name} ${rule.condition}`.toLowerCase();
  return (
    haystack.includes("general") ||
    haystack.includes("fallback") ||
    haystack.includes("no source")
  );
}

function conditionContext(context: RoutingContext): RoutingConditionContext {
  return {
    attribution: context.attribution,
    contactId: context.contactId,
    fromNumber: context.fromNumber,
    opportunityId: context.opportunityId,
    opportunitySource: context.opportunitySource,
    source: context.source,
    toNumber: context.toNumber,
    trackingPhoneNumber: context.trackingPhoneNumber,
  };
}

function structuredConditionMatches(
  node: RoutingFlowNode,
  context: RoutingContext,
) {
  if (node.type === "CONTACT_IN_OPEN_SALE") {
    return Boolean(context.opportunityId);
  }

  const condition = conditionConfigFromNodeData(node.data);
  return condition
    ? evaluateRoutingCondition(condition, conditionContext(context))
    : null;
}

function ruleFromFlowNode(
  config: PhoneSystemConfig,
  node: RoutingFlowNode,
): PhoneSystemRoutingRule | null {
  const ruleId = typeof node.data.ruleId === "string" ? node.data.ruleId : null;

  if (ruleId) {
    return (
      config.routingRules.find((rule) => rule.id === ruleId && rule.enabled) ??
      null
    );
  }

  if (
    node.id === "condition:open-sale" ||
    node.id === "action:sale-agent" ||
    node.id === "wait:owner"
  ) {
    return (
      config.routingRules.find(
        (rule) => rule.id === "known-contacts" && rule.enabled,
      ) ?? null
    );
  }

  if (
    node.id === "queue:sales-team" ||
    node.id === "voicemail:default" ||
    node.id === "end-call"
  ) {
    return (
      config.routingRules.find(
        (rule) => rule.id === "general-inbound" && rule.enabled,
      ) ?? null
    );
  }

  const [, nodeRuleId] = node.id.split(":");
  return nodeRuleId
    ? (config.routingRules.find(
        (rule) => rule.id === nodeRuleId && rule.enabled,
      ) ?? null)
    : null;
}

function flowNodeLabel(node: RoutingFlowNode) {
  const label = node.data.label;
  return typeof label === "string" && label.trim() ? label.trim() : node.id;
}

function numberFromNodeData(
  node: RoutingFlowNode,
  keys: string[],
  fallback: number,
) {
  for (const key of keys) {
    const value = node.data[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function clampedWaitSeconds(node: RoutingFlowNode) {
  return Math.max(
    1,
    Math.min(
      Math.round(numberFromNodeData(node, ["seconds", "waitSeconds"], 10)),
      3600,
    ),
  );
}

function stringFromNodeData(
  node: RoutingFlowNode,
  keys: string[],
  fallback = "",
) {
  for (const key of keys) {
    const value = node.data[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function consumedFlowNodeIds(metadata: RoutingMetadata) {
  const value = jsonObject(metadata).routingFlowConsumedNodeIds;

  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function metadataWithConsumedFlowNode(
  metadata: RoutingMetadata,
  node: RoutingFlowNode,
) {
  const consumed = consumedFlowNodeIds(metadata);

  return {
    ...jsonObject(metadata),
    routingFlowConsumedNodeIds: [...new Set([...consumed, node.id])],
  } as Prisma.InputJsonObject;
}

function defaultEnabledRule(config: PhoneSystemConfig) {
  return (
    config.routingRules
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .find((candidate) => candidate.enabled) ?? null
  );
}

function firstEnabledQueue(config: PhoneSystemConfig) {
  return (
    config.queues
      .filter(isEnabledQueue)
      .sort((a, b) => a.priority - b.priority)[0] ?? null
  );
}

function nextFlowNode(
  nodesById: Map<string, RoutingFlowNode>,
  edges: RoutingFlowEdge[],
  from: string,
  handles: string[],
) {
  const edge = handles
    .map((handle) =>
      edges.find(
        (candidate) =>
          candidate.from === from && candidate.fromHandle === handle,
      ),
    )
    .find(Boolean);

  return edge ? (nodesById.get(edge.to) ?? null) : null;
}

function flowNodeById(
  config: PhoneSystemConfig,
  nodeId: string | null | undefined,
) {
  return config.routingFlow.nodes.find((node) => node.id === nodeId) ?? null;
}

function queueForFlowNode(config: PhoneSystemConfig, node: RoutingFlowNode) {
  const dataQueueId =
    typeof node.data.queueId === "string" ? node.data.queueId : null;
  const rule = ruleFromFlowNode(config, node);
  const queue =
    queueById(config, dataQueueId) ??
    queueById(config, rule?.queueId) ??
    firstEnabledQueue(config);

  return queue ? { queue, rule } : null;
}

function routeTargetForFlowNode(node: RoutingFlowNode) {
  const value = node.data.routeTarget;

  return value === "SALE_AGENT" || value === "INDIVIDUAL" || value === "TEAM"
    ? value
    : node.type === "ROUTE_TO_SALE_AGENT"
      ? "SALE_AGENT"
      : "TEAM";
}

function specificRouteUserId(node: RoutingFlowNode) {
  const value =
    node.data.userId ?? node.data.agentUserId ?? node.data.specificUserId;
  return typeof value === "string" && value ? value : null;
}

function ivrOptionsForNode(node: RoutingFlowNode): IvrRuntimeOption[] {
  const rawOptions = Array.isArray(node.data.ivrOptions)
    ? node.data.ivrOptions
    : [];
  const normalized = normalizeIvrRuntimeOptions(
    rawOptions.map((option) => {
      const record =
        option && typeof option === "object"
          ? (option as Record<string, unknown>)
          : {};

      return {
        key: String(record.key ?? ""),
        label: String(record.label ?? ""),
        message: String(record.message ?? ""),
      };
    }),
  );

  if (normalized.length) return normalized;

  const rawKeys = Array.isArray(node.data.ivrKeys) ? node.data.ivrKeys : [];

  return normalizeIvrRuntimeOptions(
    rawKeys.map((key) => ({
      key: String(key),
      label: "",
      message: "",
    })),
  );
}

function normalizeIvrRuntimeOptions(options: IvrRuntimeOption[]) {
  const seen = new Set<string>();
  const normalized: IvrRuntimeOption[] = [];

  for (const option of options) {
    const key = option.key.trim().slice(0, 1);
    if (!/^[0-9*#]$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      key,
      label: option.label.trim().slice(0, 60),
      message: option.message.trim().slice(0, 240),
    });
    if (normalized.length >= 8) break;
  }

  return normalized;
}

function ivrOptionForDigit(node: RoutingFlowNode, digit: string) {
  return ivrOptionsForNode(node).find((option) => option.key === digit) ?? null;
}

function ivrPromptCounts(metadata: RoutingMetadata) {
  const value = jsonObject(metadata).routingFlowIvrPromptCounts;

  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, number] => {
          return typeof entry[0] === "string" && typeof entry[1] === "number";
        }),
      )
    : {};
}

function metadataWithIvrPrompt(
  metadata: RoutingMetadata,
  node: RoutingFlowNode,
) {
  const counts = ivrPromptCounts(metadata);

  return {
    ...jsonObject(metadataWithFlowNode(metadata, node)),
    routingFlowIvrPromptCounts: {
      ...counts,
      [node.id]: (counts[node.id] ?? 0) + 1,
    },
  } as Prisma.InputJsonObject;
}

function ivrRetryCount(node: RoutingFlowNode) {
  return Math.max(
    0,
    Math.min(
      Math.round(numberFromNodeData(node, ["retryCount", "retries"], 1)),
      5,
    ),
  );
}

function routingRingStrategyFor(
  queue: PhoneSystemQueue,
  rule: PhoneSystemRoutingRule | null,
) {
  return rule?.ringStrategy && rule.ringStrategy !== "QUEUE_DEFAULT"
    ? rule.ringStrategy
    : queue.ringStrategy;
}

function metadataWithFlowNode(
  metadata: RoutingMetadata,
  node: RoutingFlowNode,
  patch: Record<string, Prisma.InputJsonValue | null | undefined> = {},
): Prisma.InputJsonObject {
  const label = flowNodeLabel(node);

  return {
    ...jsonObject(metadata),
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ),
    routingSource: "routing-flow",
    routingFlowNodeId: node.id,
    routingFlowNodeLabel: label,
    routingFlowNodeType: node.type,
    routingCurrentNodeId: node.id,
    routingCurrentNodeLabel: label,
    routingCurrentNodeType: node.type,
  } as Prisma.InputJsonObject;
}

function actionForFlowNode({
  config,
  metadata,
  node,
}: {
  config: PhoneSystemConfig;
  metadata: RoutingMetadata;
  node: RoutingFlowNode;
}): RoutingFlowRuntimeAction | null {
  const nodeLabel = flowNodeLabel(node);

  if (
    node.type === "ROUTE_TO" ||
    node.type === "ROUTE_TO_SALE_AGENT" ||
    node.type === "RING_TEAM" ||
    node.type === "QUEUE"
  ) {
    const resolved = queueForFlowNode(config, node);
    if (!resolved) return null;

    const { queue, rule } = resolved;
    const routeTarget = routeTargetForFlowNode(node);
    const preferredAgentUserId =
      routeTarget === "INDIVIDUAL" ? specificRouteUserId(node) : undefined;
    const nextMetadata = metadataWithFlowNode(metadata, node, {
      queueId: queue.id,
      queueName: queue.name,
      queueRingStrategy: queue.ringStrategy,
      routingRuleId: rule?.id ?? null,
      routingRuleName: rule?.name ?? null,
      routingRuleRingStrategy: rule?.ringStrategy ?? null,
      routingRingStrategy: routingRingStrategyFor(queue, rule),
      routingOwnerOnly:
        routeTarget === "SALE_AGENT" || routeTarget === "INDIVIDUAL"
          ? true
          : null,
      preferredAgentUserId,
      preferredAgentReason:
        routeTarget === "INDIVIDUAL" && preferredAgentUserId
          ? "routing-flow-specific-agent"
          : undefined,
      routingFlowWaitUntil: null,
    });

    return {
      kind: "queue",
      metadata: nextMetadata,
      nodeId: node.id,
      nodeLabel,
      nodeType: node.type,
      queue,
      rule,
    };
  }

  if (node.type === "WAIT") {
    const metadataObject = jsonObject(metadata);
    const existingWaitUntil =
      typeof metadataObject.routingFlowWaitUntil === "string"
        ? Date.parse(metadataObject.routingFlowWaitUntil)
        : Number.NaN;
    const waitUntil =
      Number.isFinite(existingWaitUntil) && existingWaitUntil > Date.now()
        ? new Date(existingWaitUntil).toISOString()
        : new Date(Date.now() + clampedWaitSeconds(node) * 1000).toISOString();

    return {
      kind: "wait",
      metadata: metadataWithFlowNode(metadata, node, {
        routingFlowWaitUntil: waitUntil,
      }),
      nodeId: node.id,
      nodeLabel,
      nodeType: node.type,
      seconds: clampedWaitSeconds(node),
      waitUntil,
    };
  }

  if (node.type === "VOICEMAIL" || node.type === "FALLBACK") {
    return {
      kind: "voicemail",
      metadata: metadataWithFlowNode(metadata, node, {
        fallbackDestination: "VOICEMAIL",
        routingFlowWaitUntil: null,
      }),
      nodeId: node.id,
      nodeLabel,
      nodeType: node.type,
    };
  }

  if (node.type === "END_CALL" || node.type === "NO_MATCH") {
    return {
      kind: "end",
      metadata: metadataWithFlowNode(metadata, node, {
        fallbackDestination: "HANGUP",
        routingFlowWaitUntil: null,
      }),
      nodeId: node.id,
      nodeLabel,
      nodeType: node.type,
    };
  }

  if (node.type === "AUDIO_MESSAGE") {
    return {
      kind: "message",
      metadata: metadataWithConsumedFlowNode(
        metadataWithFlowNode(metadata, node, {
          routingFlowWaitUntil: null,
        }),
        node,
      ),
      message: stringFromNodeData(
        node,
        ["message", "text"],
        "Please hold while we route your call.",
      ),
      nodeId: node.id,
      nodeLabel,
      nodeType: node.type,
    };
  }

  if (node.type === "IVR_MENU") {
    return {
      kind: "ivr",
      audioUrl: stringFromNodeData(node, ["audioUrl", "recordingUrl"]) || null,
      language: stringFromNodeData(node, ["language"], "en-GB"),
      metadata: metadataWithFlowNode(metadata, node, {
        routingFlowWaitUntil: null,
      }),
      prompt: stringFromNodeData(
        node,
        ["prompt", "message"],
        "Press 1 for sales or stay on the line.",
      ),
      promptType: stringFromNodeData(node, ["promptType"], "TEXT_TO_SPEECH"),
      retryMessage: stringFromNodeData(
        node,
        ["retryMessage"],
        "That option was not recognised. Please try again.",
      ),
      voice: stringFromNodeData(node, ["voice"], "alice"),
      nodeId: node.id,
      nodeLabel,
      nodeType: node.type,
    };
  }

  if (node.type === "REDIRECT") {
    const destination = stringFromNodeData(node, [
      "destination",
      "phoneNumber",
      "sipAddress",
    ]);
    if (!destination) return null;

    return {
      kind: "redirect",
      metadata: metadataWithFlowNode(metadata, node, {
        fallbackDestination: "REDIRECT",
        routingFlowWaitUntil: null,
      }),
      destination,
      nodeId: node.id,
      nodeLabel,
      nodeType: node.type,
    };
  }

  return null;
}

function timeRuleMatches(config: PhoneSystemConfig, node: RoutingFlowNode) {
  const { time } = localTimeParts(config.businessHours.timezone);
  const start = stringFromNodeData(node, ["start", "startTime"], "09:00");
  const end = stringFromNodeData(node, ["end", "endTime"], "17:30");

  return start <= end
    ? time >= start && time <= end
    : time >= start || time <= end;
}

function dateRuleMatches(config: PhoneSystemConfig, node: RoutingFlowNode) {
  const today = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: config.businessHours.timezone,
    year: "numeric",
  }).format(new Date());
  const date = stringFromNodeData(node, ["date"]);
  const start = stringFromNodeData(node, ["startDate"]);
  const end = stringFromNodeData(node, ["endDate"]);
  const holidayMatch = config.businessHours.holidays.some(
    (holiday) => holiday.closed && holiday.date === today,
  );

  if (date) return today === date;
  if (start && end) return today >= start && today <= end;

  return holidayMatch;
}

function resolveRouteFromFlow(
  config: PhoneSystemConfig,
  context: RoutingContext,
) {
  const flow = config.routingFlow;

  if (!flow.nodes.length || !flow.edges.length) {
    return null;
  }

  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  let current =
    flow.nodes.find((node) => node.type === "INBOUND_CALL") ??
    flow.nodes.find((node) => node.type === "START") ??
    null;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);

    if (current.type === "CONTACT_IN_OPEN_SALE") {
      current = nextFlowNode(
        nodesById,
        flow.edges,
        current.id,
        context.opportunityId ? ["yes"] : ["no"],
      );
      continue;
    }

    if (current.type === "BUSINESS_HOURS") {
      current = nextFlowNode(
        nodesById,
        flow.edges,
        current.id,
        isBusinessOpen(config) ? ["yes"] : ["no"],
      );
      continue;
    }

    if (current.type === "TIME_RULE") {
      current = nextFlowNode(
        nodesById,
        flow.edges,
        current.id,
        timeRuleMatches(config, current) ? ["yes"] : ["no"],
      );
      continue;
    }

    if (current.type === "DATE_RULE") {
      current = nextFlowNode(
        nodesById,
        flow.edges,
        current.id,
        dateRuleMatches(config, current) ? ["yes"] : ["no"],
      );
      continue;
    }

    if (current.type === "IF_ELSE" || current.type === "RULE") {
      const structuredMatch = structuredConditionMatches(current, context);
      const rule =
        structuredMatch === null ? ruleFromFlowNode(config, current) : null;
      current = nextFlowNode(
        nodesById,
        flow.edges,
        current.id,
        (structuredMatch ?? (rule ? matchesRule(rule, context) : false))
          ? ["yes"]
          : ["no"],
      );
      continue;
    }

    if (
      current.type === "ROUTE_TO" ||
      current.type === "ROUTE_TO_SALE_AGENT" ||
      current.type === "RING_TEAM" ||
      current.type === "QUEUE"
    ) {
      const resolved = queueForFlowNode(config, current);

      return resolved
        ? {
            queue: resolved.queue,
            rule: resolved.rule,
            nodeId: current.id,
            nodeLabel: flowNodeLabel(current),
            nodeType: current.type,
            source: "routing-flow",
          }
        : null;
    }

    if (current.type === "END_CALL" || current.type === "NO_MATCH") {
      return null;
    }

    current = nextFlowNode(nodesById, flow.edges, current.id, [
      "next",
      "no_answer",
      "timeout",
      "yes",
      "no",
    ]);
  }

  return null;
}

function localTimeParts(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "short",
  }).formatToParts(date);

  return {
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "Mon",
    time: `${parts.find((part) => part.type === "hour")?.value ?? "00"}:${
      parts.find((part) => part.type === "minute")?.value ?? "00"
    }`,
  };
}

function isBusinessOpen(config: PhoneSystemConfig, date = new Date()) {
  const { time, weekday } = localTimeParts(config.businessHours.timezone, date);
  const day = config.businessHours.weekly.find(
    (entry) => entry.label === weekday,
  );

  return Boolean(day?.open && time >= day.start && time <= day.end);
}

export async function resolveInboundRoute(context: RoutingContext) {
  const config = await getPhoneSystemConfig();

  if (!isBusinessOpen(config)) {
    const afterHoursQueue = queueById(
      config,
      config.businessHours.afterHours.queueId,
    );

    return {
      afterHours: true,
      config,
      queue:
        afterHoursQueue ??
        config.queues
          .filter(isEnabledQueue)
          .sort((a, b) => a.priority - b.priority)[0] ??
        null,
      rule: null,
      routingSource: "business-hours",
      routingFlowNodeId: null,
      routingFlowNodeLabel: null,
      routingFlowNodeType: null,
    };
  }

  const graphRoute = resolveRouteFromFlow(config, context);
  const rule =
    graphRoute?.rule ??
    config.routingRules
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .find((candidate) => matchesRule(candidate, context)) ??
    defaultEnabledRule(config);
  const queue =
    graphRoute?.queue ??
    queueById(config, rule?.queueId) ??
    firstEnabledQueue(config);

  return {
    afterHours: false,
    config,
    queue,
    rule,
    routingSource: graphRoute?.source ?? "routing-rules",
    routingFlowNodeId: graphRoute?.nodeId ?? null,
    routingFlowNodeLabel: graphRoute?.nodeLabel ?? null,
    routingFlowNodeType: graphRoute?.nodeType ?? null,
  };
}

export async function resolveRoutingFlowRuntimeAction({
  context = {},
  digits,
  metadata,
  trigger,
}: {
  context?: RoutingContext;
  digits?: string | null;
  metadata: RoutingMetadata;
  trigger: RoutingFlowRuntimeTrigger;
}): Promise<RoutingFlowRuntimeAction | null> {
  const metadataObject = jsonObject(metadata);
  if (metadataObject.routingSource !== "routing-flow") {
    return null;
  }

  const config = await getPhoneSystemConfig();
  const flow = config.routingFlow;
  if (!flow.nodes.length || !flow.edges.length) {
    return null;
  }

  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  let nextMetadata: RoutingMetadata = metadata;
  const pendingNodeId = stringFromMetadata(
    metadataObject.routingFlowPendingNodeId,
  );
  let current =
    (pendingNodeId ? flowNodeById(config, pendingNodeId) : null) ??
    flowNodeById(
      config,
      stringFromMetadata(metadataObject.routingCurrentNodeId),
    ) ??
    flowNodeById(config, stringFromMetadata(metadataObject.routingFlowNodeId));

  if (!current) {
    return null;
  }

  if (pendingNodeId) {
    nextMetadata = {
      ...metadataObject,
      routingFlowPendingMessage: null,
      routingFlowPendingNodeId: null,
    } as Prisma.InputJsonObject;
  }

  if (trigger === "no_answer") {
    current = nextFlowNode(nodesById, flow.edges, current.id, [
      "no_answer",
      "timeout",
      "next",
    ]);
  }

  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);

    if (
      current.type === "CONTACT_IN_OPEN_SALE" ||
      current.type === "IF_ELSE" ||
      current.type === "RULE" ||
      current.type === "BUSINESS_HOURS" ||
      current.type === "TIME_RULE" ||
      current.type === "DATE_RULE"
    ) {
      const structuredMatch =
        current.type === "CONTACT_IN_OPEN_SALE" ||
        current.type === "IF_ELSE" ||
        current.type === "RULE"
          ? structuredConditionMatches(current, context)
          : null;
      const legacyRule =
        structuredMatch === null &&
        (current.type === "IF_ELSE" || current.type === "RULE")
          ? ruleFromFlowNode(config, current)
          : null;
      const matched =
        current.type === "CONTACT_IN_OPEN_SALE" ||
        current.type === "IF_ELSE" ||
        current.type === "RULE"
          ? (structuredMatch ??
            (legacyRule ? matchesRule(legacyRule, context) : false))
          : current.type === "BUSINESS_HOURS"
            ? isBusinessOpen(config)
            : current.type === "TIME_RULE"
              ? timeRuleMatches(config, current)
              : dateRuleMatches(config, current);

      nextMetadata = metadataWithFlowNode(nextMetadata, current, {
        routingFlowConditionResult: matched ? "yes" : "no",
        routingFlowWaitUntil: null,
      });
      current = nextFlowNode(
        nodesById,
        flow.edges,
        current.id,
        matched ? ["yes"] : ["no"],
      );
      continue;
    }

    if (current.type === "WAIT") {
      const waitUntilValue = jsonObject(nextMetadata).routingFlowWaitUntil;
      if (typeof waitUntilValue === "string") {
        const waitUntilMs = Date.parse(waitUntilValue);

        if (Number.isFinite(waitUntilMs) && waitUntilMs > Date.now()) {
          const action = actionForFlowNode({
            config,
            metadata: nextMetadata,
            node: current,
          });
          return action?.kind === "wait" ? action : null;
        }

        nextMetadata = metadataWithFlowNode(nextMetadata, current, {
          routingFlowWaitUntil: null,
        });
        current = nextFlowNode(nodesById, flow.edges, current.id, ["next"]);
        continue;
      }

      const action = actionForFlowNode({
        config,
        metadata: nextMetadata,
        node: current,
      });
      if (!action || action.kind !== "wait") return action;

      return action;
    }

    if (current.type === "AUDIO_MESSAGE") {
      if (!consumedFlowNodeIds(nextMetadata).includes(current.id)) {
        const action = actionForFlowNode({
          config,
          metadata: nextMetadata,
          node: current,
        });
        return action?.kind === "message" ? action : null;
      }

      nextMetadata = {
        ...jsonObject(nextMetadata),
        routingFlowConsumedNodeIds: consumedFlowNodeIds(nextMetadata).filter(
          (nodeId) => nodeId !== current?.id,
        ),
      } as Prisma.InputJsonObject;
      current = nextFlowNode(nodesById, flow.edges, current.id, ["next"]);
      continue;
    }

    if (current.type === "IVR_MENU") {
      if (!digits) {
        const promptCount = ivrPromptCounts(nextMetadata)[current.id] ?? 0;
        const hasAlreadyPrompted =
          stringFromMetadata(jsonObject(nextMetadata).routingCurrentNodeId) ===
            current.id && promptCount > 0;

        if (hasAlreadyPrompted) {
          const timeoutNode = nextFlowNode(nodesById, flow.edges, current.id, [
            "timeout",
          ]);
          if (timeoutNode) {
            nextMetadata = metadataWithFlowNode(nextMetadata, current, {
              routingFlowIvrResult: "timeout",
              routingFlowWaitUntil: null,
            });
            current = timeoutNode;
            continue;
          }

          if (promptCount > ivrRetryCount(current)) {
            nextMetadata = metadataWithFlowNode(nextMetadata, current, {
              routingFlowIvrResult: "retries_exhausted",
              routingFlowWaitUntil: null,
            });
            current = nextFlowNode(nodesById, flow.edges, current.id, [
              "retries_exhausted",
              "next",
              "no",
            ]);
            continue;
          }
        }

        const action = actionForFlowNode({
          config,
          metadata: metadataWithIvrPrompt(nextMetadata, current),
          node: current,
        });
        return action?.kind === "ivr" ? action : null;
      }

      nextMetadata = metadataWithFlowNode(nextMetadata, current, {
        routingFlowIvrDigit: digits,
        routingFlowWaitUntil: null,
      });
      const digitNode = nextFlowNode(nodesById, flow.edges, current.id, [
        `digit:${digits}`,
        `key:${digits}`,
        digits,
      ]);
      if (digitNode) {
        const option = ivrOptionForDigit(current, digits);
        if (option?.message) {
          return {
            kind: "message",
            metadata: metadataWithFlowNode(nextMetadata, current, {
              routingFlowIvrOptionLabel: option.label || null,
              routingFlowIvrResult: "digit",
              routingFlowPendingMessage: option.message,
              routingFlowPendingNodeId: digitNode.id,
              routingFlowWaitUntil: null,
            }),
            message: option.message,
            nodeId: current.id,
            nodeLabel: flowNodeLabel(current),
            nodeType: current.type,
          };
        }
      }
      if (digitNode) {
        current = digitNode;
        continue;
      }

      nextMetadata = metadataWithFlowNode(nextMetadata, current, {
        routingFlowIvrResult: "invalid",
        routingFlowWaitUntil: null,
      });
      current =
        nextFlowNode(nodesById, flow.edges, current.id, ["invalid"]) ??
        nextFlowNode(nodesById, flow.edges, current.id, [
          "retries_exhausted",
          "next",
          "no",
        ]);
      continue;
    }

    const action = actionForFlowNode({
      config,
      metadata: nextMetadata,
      node: current,
    });
    if (action) {
      return action;
    }

    current = nextFlowNode(nodesById, flow.edges, current.id, [
      "next",
      "yes",
      "no",
      "no_answer",
      "timeout",
    ]);
  }

  return null;
}

function stringFromMetadata(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function queueIdFromMetadata(metadata: RoutingMetadata) {
  const value = jsonObject(metadata).queueId;
  return typeof value === "string" ? value : null;
}

function ringStrategyFromMetadata(
  metadata: RoutingMetadata,
): QueueRingStrategy | null {
  const value = jsonObject(metadata).routingRingStrategy;

  return value === "SIMULTANEOUS" ||
    value === "ROUND_ROBIN" ||
    value === "PRIORITY"
    ? value
    : null;
}

function preferredAgentUserIdFromMetadata(metadata: RoutingMetadata) {
  const value = jsonObject(metadata).preferredAgentUserId;
  return typeof value === "string" && value ? value : null;
}

function ownerOnlyFromMetadata(metadata: RoutingMetadata) {
  return jsonObject(metadata).routingOwnerOnly === true;
}

function agentIsAssignedToQueue(
  queue: PhoneSystemQueue,
  config: PhoneSystemConfig,
  userId: string,
) {
  const agentSettings = config.agentSettings.find(
    (settings) => settings.userId === userId,
  );
  const queueAssignedUserIds = new Set(queue.assignedAgentIds);
  const agentAssignedQueueIds = new Set(agentSettings?.assignedQueueIds ?? []);

  if (!queueAssignedUserIds.size && !agentAssignedQueueIds.size) {
    return true;
  }

  return (
    queueAssignedUserIds.has(userId) || agentAssignedQueueIds.has(queue.id)
  );
}

function maxConcurrentCalls(config: PhoneSystemConfig, userId: string) {
  return (
    config.agentSettings.find((settings) => settings.userId === userId)
      ?.maxConcurrentCalls ?? 1
  );
}

function isForcedUnavailable(config: PhoneSystemConfig, userId: string) {
  return Boolean(
    config.agentSettings.find((settings) => settings.userId === userId)
      ?.forceUnavailable,
  );
}

function browserAgentIsFresh(user: {
  voiceLastSeenAt?: Date | null;
  voiceRoutingMode: VoiceRoutingMode;
}) {
  if (user.voiceRoutingMode !== "BROWSER" && user.voiceRoutingMode !== "FLEX") {
    return true;
  }

  return Boolean(
    user.voiceLastSeenAt &&
    user.voiceLastSeenAt.getTime() >= Date.now() - browserAvailabilityTtlMs,
  );
}

function agentQueueOrder(queue: PhoneSystemQueue, userId: string) {
  const index = queue.assignedAgentIds.indexOf(userId);
  return index === -1 ? 999 : index;
}

function sortableAgentName(agent: QueueAgent) {
  return `${agent.firstName ?? ""} ${agent.name ?? ""}`.trim().toLowerCase();
}

async function sortRoundRobinAgents(
  agents: QueueAgent[],
  queue: PhoneSystemQueue,
) {
  if (agents.length <= 1) {
    return agents;
  }

  const recentEntries = await prisma.callQueueEntry.findMany({
    orderBy: { queuedAt: "desc" },
    take: 200,
    select: {
      metadata: true,
      queuedAt: true,
    },
  });
  const lastAttemptedAtByUserId = new Map<string, number>();

  for (const entry of recentEntries) {
    const metadata = jsonObject(entry.metadata);

    if (metadata.queueId !== queue.id) {
      continue;
    }

    for (const attempt of routingAttempts(metadata)) {
      const attemptedAt =
        Date.parse(attempt.startedAt) || entry.queuedAt.getTime();
      const previous = lastAttemptedAtByUserId.get(attempt.agentUserId) ?? 0;

      if (attemptedAt > previous) {
        lastAttemptedAtByUserId.set(attempt.agentUserId, attemptedAt);
      }
    }
  }

  return agents.slice().sort((a, b) => {
    const attemptedDelta =
      (lastAttemptedAtByUserId.get(a.id) ?? 0) -
      (lastAttemptedAtByUserId.get(b.id) ?? 0);

    if (attemptedDelta !== 0) {
      return attemptedDelta;
    }

    const queueOrderDelta =
      agentQueueOrder(queue, a.id) - agentQueueOrder(queue, b.id);

    if (queueOrderDelta !== 0) {
      return queueOrderDelta;
    }

    return sortableAgentName(a).localeCompare(sortableAgentName(b));
  });
}

export async function findAvailableQueueAgents({
  excludeUserIds = [],
  metadata,
  queueId,
}: {
  excludeUserIds?: string[];
  metadata?: RoutingMetadata;
  queueId?: string | null;
}): Promise<{ agents: QueueAgent[]; queue: PhoneSystemQueue | null }> {
  const config = await getPhoneSystemConfig();
  const resolvedQueue =
    queueById(config, queueId) ??
    queueById(config, queueIdFromMetadata(metadata)) ??
    config.queues
      .filter(isEnabledQueue)
      .sort((a, b) => a.priority - b.priority)[0] ??
    null;

  if (!resolvedQueue) {
    return { agents: [], queue: null };
  }

  const preferredAgentUserId = preferredAgentUserIdFromMetadata(metadata);
  const ownerOnly = ownerOnlyFromMetadata(metadata);
  const excludedIds = new Set([
    ...excludeUserIds,
    ...routingAttempts(metadata).map((attempt) => attempt.agentUserId),
  ]);

  if (preferredAgentUserId && !excludedIds.has(preferredAgentUserId)) {
    const preferredAgent = await prisma.user.findFirst({
      where: {
        id: preferredAgentUserId,
        status: "ACTIVE",
        voiceAvailability: { in: ["AVAILABLE", "BUSY"] },
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        mobile: true,
        landline: true,
        sipAddress: true,
        voiceExtension: true,
        voiceRoutingMode: true,
        voiceLastSeenAt: true,
      },
    });

    if (
      preferredAgent &&
      targetForUser(preferredAgent) &&
      browserAgentIsFresh(preferredAgent) &&
      !isForcedUnavailable(config, preferredAgent.id)
    ) {
      const activePreferredCallCount = await prisma.callLog.count({
        where: {
          ...liveCallWhere(),
          userId: preferredAgent.id,
        },
      });

      if (
        activePreferredCallCount < maxConcurrentCalls(config, preferredAgent.id)
      ) {
        return { agents: [preferredAgent], queue: resolvedQueue };
      }
    }
  }

  if (ownerOnly) {
    return { agents: [], queue: resolvedQueue };
  }

  const browserSeenAfter = new Date(Date.now() - browserAvailabilityTtlMs);
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      voiceAvailability: "AVAILABLE",
      id: excludedIds.size ? { notIn: [...excludedIds] } : undefined,
      OR: [
        { voiceRoutingMode: { notIn: ["BROWSER", "FLEX"] } },
        { voiceLastSeenAt: { gte: browserSeenAfter } },
      ],
    },
    orderBy: [
      { voiceLastSeenAt: "desc" },
      { firstName: "asc" },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      mobile: true,
      landline: true,
      sipAddress: true,
      voiceExtension: true,
      voiceRoutingMode: true,
    },
  });
  const activeCalls = await prisma.callLog.groupBy({
    by: ["userId"],
    where: {
      ...liveCallWhere(),
      userId: { in: users.map((user) => user.id) },
    },
    _count: { _all: true },
  });
  const activeCallsByUserId = new Map(
    activeCalls.map((entry) => [entry.userId, entry._count._all]),
  );
  let agents = users.filter((user) => {
    if (!targetForUser(user)) return false;
    if (
      user.id !== preferredAgentUserId &&
      !agentIsAssignedToQueue(resolvedQueue, config, user.id)
    ) {
      return false;
    }
    if (isForcedUnavailable(config, user.id)) return false;

    return (
      (activeCallsByUserId.get(user.id) ?? 0) <
      maxConcurrentCalls(config, user.id)
    );
  });
  const ringStrategy =
    ringStrategyFromMetadata(metadata) ?? resolvedQueue.ringStrategy;

  if (ringStrategy === "PRIORITY") {
    agents.sort((a, b) => {
      const aIndex = resolvedQueue.assignedAgentIds.indexOf(a.id);
      const bIndex = resolvedQueue.assignedAgentIds.indexOf(b.id);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
  }

  if (ringStrategy === "ROUND_ROBIN") {
    agents = await sortRoundRobinAgents(agents, resolvedQueue);
  }

  if (preferredAgentUserId) {
    agents.sort((a, b) => {
      if (a.id === preferredAgentUserId) return -1;
      if (b.id === preferredAgentUserId) return 1;
      return 0;
    });
  }

  if (ringStrategy === "SIMULTANEOUS") {
    return { agents, queue: resolvedQueue };
  }

  return { agents: agents.slice(0, 1), queue: resolvedQueue };
}
