import "server-only";

import twilio from "twilio";
import type { Prisma } from "@prisma/client";
import type { TwilioVoiceRuntime } from "@/lib/integrations/twilio-server";
import {
  buildConferenceTwiML,
  displayUserName,
  targetForUser,
} from "@/lib/telephony/twilio-voice";

type RoutingAttemptPatch = Record<
  string,
  Prisma.InputJsonValue | null | undefined
>;

export type RoutingAttempt = {
  id: string;
  agentUserId: string;
  agentName: string;
  agentTarget: string;
  mode: "auto" | "manual";
  status: string;
  startedAt: string;
  agentCallSid?: string;
  routedByUserId?: string;
  updatedAt?: string;
};

export type RoutingTransition = {
  id: string;
  event: string;
  at: string;
  nodeId?: string | null;
  nodeLabel?: string | null;
  queueId?: string | null;
  queueName?: string | null;
  agentUserId?: string | null;
  reason?: string | null;
  detail?: string | null;
};

export function jsonObject(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
): Record<string, Prisma.InputJsonValue> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...(metadata as Prisma.JsonObject) } as Record<
    string,
    Prisma.InputJsonValue
  >;
}

export function metadataString(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
  key: string,
) {
  const value = jsonObject(metadata)[key];
  return typeof value === "string" ? value : null;
}

export function routingAttempts(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
): RoutingAttempt[] {
  const attempts = jsonObject(metadata).attempts;

  if (!Array.isArray(attempts)) {
    return [];
  }

  return attempts.filter(
    (attempt): attempt is RoutingAttempt =>
      Boolean(
        attempt &&
          typeof attempt === "object" &&
          !Array.isArray(attempt) &&
          typeof (attempt as { id?: unknown }).id === "string" &&
          typeof (attempt as { agentUserId?: unknown }).agentUserId === "string",
      ),
  );
}

export function routingTransitions(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
): RoutingTransition[] {
  const transitions = jsonObject(metadata).routingTransitions;

  if (!Array.isArray(transitions)) {
    return [];
  }

  return transitions.filter(
    (transition): transition is RoutingTransition =>
      Boolean(
        transition &&
          typeof transition === "object" &&
          !Array.isArray(transition) &&
          typeof (transition as { id?: unknown }).id === "string" &&
          typeof (transition as { event?: unknown }).event === "string" &&
          typeof (transition as { at?: unknown }).at === "string",
      ),
  );
}

export function appendRoutingTransition(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
  transition: Omit<RoutingTransition, "id" | "at"> & { at?: string },
  patch: RoutingAttemptPatch = {},
): Prisma.InputJsonObject {
  const at = transition.at ?? new Date().toISOString();
  const nextTransition: RoutingTransition = {
    id: `${Date.now()}-${transition.event}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    ...transition,
  };

  return {
    ...jsonObject(metadata),
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ),
    routingTransitions: [...routingTransitions(metadata).slice(-19), nextTransition],
    routingLastEvent: nextTransition.event,
    routingLastEventAt: at,
    routingCurrentNodeId: transition.nodeId ?? jsonObject(metadata).routingCurrentNodeId ?? null,
    routingCurrentNodeLabel:
      transition.nodeLabel ?? jsonObject(metadata).routingCurrentNodeLabel ?? null,
  } as Prisma.InputJsonObject;
}

export function appendRoutingAttempt(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
  attempt: RoutingAttempt,
  patch: RoutingAttemptPatch = {},
): Prisma.InputJsonObject {
  return {
    ...jsonObject(metadata),
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ),
    attempts: [...routingAttempts(metadata), attempt],
  } as Prisma.InputJsonObject;
}

export function updateRoutingAttempt(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
  matcher: { agentCallSid?: string | null; agentUserId?: string | null },
  patch: RoutingAttemptPatch,
): Prisma.InputJsonObject {
  const attempts = routingAttempts(metadata);
  const now = new Date().toISOString();

  return {
    ...jsonObject(metadata),
    attempts: attempts.map((attempt) => {
      const matchedByCallSid =
        matcher.agentCallSid && attempt.agentCallSid === matcher.agentCallSid;
      const matchedByUserId =
        !matcher.agentCallSid &&
        matcher.agentUserId &&
        attempt.agentUserId === matcher.agentUserId;

      if (!matchedByCallSid && !matchedByUserId) {
        return attempt;
      }

      return {
        ...attempt,
        ...Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value !== undefined),
        ),
        updatedAt: now,
      };
    }),
  } as Prisma.InputJsonObject;
}

export function contactDisplayName(contact: {
  firstName: string;
  lastName: string;
} | null) {
  if (!contact) {
    return null;
  }

  return `${contact.firstName} ${contact.lastName}`.trim() || null;
}

export function withClientCallContext(
  target: string,
  context: Record<string, string | null | undefined>,
) {
  if (!target.startsWith("client:")) {
    return target;
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(context)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${target}?${query}` : target;
}

export async function createQueueAgentCall({
  runtime,
  origin,
  queueEntry,
  agent,
  mode,
}: {
  runtime: TwilioVoiceRuntime;
  origin: string;
  queueEntry: {
    callSid: string;
    callLogId: string | null;
    conferenceName: string;
    fromNumber: string | null;
    contactId: string | null;
    opportunityId: string | null;
    contact: { firstName: string; lastName: string } | null;
    opportunity: { title: string } | null;
  };
  agent: {
    id: string;
    name: string;
    firstName: string | null;
    lastName: string | null;
    mobile: string | null;
    landline: string | null;
    sipAddress: string | null;
    voiceExtension: string | null;
    voiceRoutingMode: string;
  };
  mode: "auto" | "manual";
}) {
  const statusUrl = new URL("/api/webhooks/twilio/voice/status", origin);
  if (queueEntry.callLogId) {
    statusUrl.searchParams.set("callLogId", queueEntry.callLogId);
  }
  statusUrl.searchParams.set("agentUserId", agent.id);

  const agentTarget = withClientCallContext(targetForUser(agent), {
    CallerNumber: queueEntry.fromNumber,
    CallerName: contactDisplayName(queueEntry.contact),
    ContactId: queueEntry.contactId,
    OpportunityId: queueEntry.opportunityId,
    OpportunityName: queueEntry.opportunity?.title,
    CallLogId: queueEntry.callLogId,
    OriginalCallSid: queueEntry.callSid,
  });
  const agentCall = await twilio(runtime.accountSid, runtime.authToken).calls.create({
    to: agentTarget,
    from: runtime.voiceCallerId,
    twiml: buildConferenceTwiML({
      conferenceName: queueEntry.conferenceName,
      statusUrl: statusUrl.toString(),
      participantLabel: `agent-${agent.id}`,
    }),
    statusCallback: statusUrl.toString(),
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });

  return {
    agentCall,
    attempt: {
      id: `${Date.now()}-${agent.id}-${agentCall.sid}`,
      agentUserId: agent.id,
      agentName: displayUserName(agent),
      agentTarget,
      mode,
      status: "ringing",
      startedAt: new Date().toISOString(),
      agentCallSid: agentCall.sid,
    } satisfies RoutingAttempt,
  };
}
