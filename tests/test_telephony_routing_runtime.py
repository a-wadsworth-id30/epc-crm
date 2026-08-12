import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_queue_voicemail_fallback_does_not_leave_call_log_in_progress():
    queue_route = read("src/app/api/webhooks/twilio/voice/queue/route.ts")

    assert 'status: "NO_ANSWER"' in queue_route
    assert 'endedAt: new Date()' in queue_route
    assert 'status: shouldSendToVoicemail ? "IN_PROGRESS" : "NO_ANSWER"' not in queue_route
    assert "redirectCallToVoicemailShortly" in queue_route


def test_core_and_advanced_flow_nodes_have_runtime_actions():
    routing = read("src/lib/telephony/phone-system-routing.ts")
    queue_route = read("src/app/api/webhooks/twilio/voice/queue/route.ts")

    for kind in [
        '"queue"',
        '"wait"',
        '"voicemail"',
        '"end"',
        '"message"',
        '"ivr"',
        '"redirect"',
    ]:
        assert f"kind: {kind}" in routing

    assert 'current.type === "BUSINESS_HOURS"' in routing
    assert 'current.type === "TIME_RULE"' in routing
    assert 'current.type === "DATE_RULE"' in routing
    assert 'current.type === "AUDIO_MESSAGE"' in routing
    assert 'current.type === "IVR_MENU"' in routing
    assert 'node.type === "REDIRECT"' in routing
    assert "ivrPromptCounts" in routing
    assert "metadataWithIvrPrompt" in routing
    assert '"retries_exhausted"' in routing
    assert '"invalid"' in routing
    assert '"timeout"' in routing
    assert "currentFlowAction.promptType" in queue_route
    assert "currentFlowAction.audioUrl" in queue_route
    assert "currentFlowAction.retryMessage" in queue_route


def test_runtime_transitions_are_deduplicated_per_node_action():
    queue_route = read("src/app/api/webhooks/twilio/voice/queue/route.ts")

    assert "routingRuntimeActionKey" in queue_route
    assert "current.routingRuntimeActionKey === actionKey" in queue_route
    assert "flow_message" in queue_route
    assert "flow_ivr" in queue_route
    assert "flow_redirect" in queue_route


def test_agent_answer_and_completion_update_call_log_attempt_metadata():
    status_route = read("src/app/api/webhooks/twilio/voice/status/route.ts")

    assert 'status: "answered"' in status_route
    assert 'status: "completed"' in status_route
    assert "metadata: updateRoutingAttempt(" in status_route
    assert "where: { id: callLogId }" in status_route


def test_customer_conference_leave_abandons_queue_and_cancels_pending_agents():
    status_route = read("src/app/api/webhooks/twilio/voice/status/route.ts")

    assert 'statusCallbackEvent === "participant-leave"' in status_route
    assert 'participantLabel === "customer"' in status_route
    assert "cancelPendingAgentLegs" in status_route
    assert 'status: answeredEntry ? "COMPLETED" : "ABANDONED"' in status_route
    assert 'status: answeredEntry ? "COMPLETED" : "CANCELED"' in status_route
    assert '{ status: "abandoned", endedAt }' in status_route


def test_routing_diagnostics_show_readable_journey():
    page = read("src/components/crm-boilerplate/telephony-pages/PhoneSystemPage.tsx")

    assert "function routingJourney" in page
    assert 'transition.event === "flow_wait"' in page
    assert 'transition.event === "flow_message"' in page
    assert 'transition.event === "flow_ivr"' in page
    assert 'transition.event === "flow_redirect"' in page
    assert 'journey.join(" -> ")' in page


def test_sale_owner_node_stays_owner_only_before_team_fallback():
    routing = read("src/lib/telephony/phone-system-routing.ts")

    assert re.search(
        r'routeTarget\s*===\s*"SALE_AGENT"\s*\|\|\s*routeTarget\s*===\s*"INDIVIDUAL"\s*\?\s*true\s*:\s*null',
        routing,
    )
    assert 'preferredAgentReason:' in routing
    assert "if (ownerOnly)" in routing
    assert "return { agents: [], queue: resolvedQueue }" in routing


def test_queue_agent_assignment_compares_user_ids_to_user_ids():
    routing = read("src/lib/telephony/phone-system-routing.ts")

    assert "const queueAssignedUserIds = new Set(queue.assignedAgentIds)" in routing
    assert "const agentAssignedQueueIds = new Set(agentSettings?.assignedQueueIds ?? [])" in routing
    assert re.search(
        r"return\s*\(\s*queueAssignedUserIds\.has\(userId\)\s*\|\|\s*agentAssignedQueueIds\.has\(queue\.id\)\s*\)",
        routing,
    )
    assert "...queue.assignedAgentIds,\n    ...(agentSettings?.assignedQueueIds ?? [])," not in routing


def test_softphone_can_generate_lead_from_unknown_call():
    provider = read("src/components/crm-boilerplate/SoftphoneProvider.tsx")
    route = read("src/app/api/telephony/call-lead/route.ts")
    caller_context = read("src/app/api/telephony/caller-context/route.ts")

    assert 'fetch("/api/telephony/call-lead"' in provider
    assert "Generate lead" in provider
    assert "canGenerateLeadFromCall" in provider
    assert "setActiveCallLogId(callLogId)" in provider
    assert "matched: Boolean(resolvedContact?.id || opportunity?.id)" in caller_context
    assert "salesOpportunity.create" in route
    assert "callLog.update" in route
    assert "attributionRecord.updateMany" in route
    assert 'source: "softphone-call-lead"' in route


def test_routing_editor_nodes_are_draggable_and_route_to_is_configurable():
    builder = read("src/components/crm-boilerplate/CallRoutingFlowBuilder.tsx")

    assert 'data-routing-node-card' in builder
    assert 'target.closest("[data-routing-node-card]")' in builder
    assert "setPointerCapture" in builder
    assert 'window.addEventListener("pointermove"' in builder
    assert "cleanDefaultNodePositions" in builder
    assert "Tidy flow" in builder
    assert "getEdgeTargetPoint(to, source)" in builder
    assert 'type: "ROUTE_TO"' in builder
    assert "Send the call to a sale agent, person or team." in builder
    assert 'value="SALE_AGENT"' in builder
    assert 'value="INDIVIDUAL"' in builder
    assert 'value="TEAM"' in builder
    assert "defaultOutgoingHandle(insertedNode)" in builder
    assert 'type: "ROUTE_TO",' in builder
    assert 'data: { label: "Route to", routeTarget: "SALE_AGENT" }' in builder
    assert "normalizeDefaultRouteToNode" in builder


def test_routing_editor_exposes_richer_ivr_configuration():
    builder = read("src/components/crm-boilerplate/CallRoutingFlowBuilder.tsx")

    assert "Prompt type" in builder
    assert "General IVR settings" in builder
    assert "Phone keypad" in builder
    assert "Keypad options" in builder
    assert "Selected key route" in builder
    assert "bg-brand-50/45" in builder
    assert "Fallback handling" in builder
    assert "Prompt preview" in builder
    assert "Use prompt" in builder
    assert "Message for this key" in builder
    assert "Add key ${key}" in builder
    assert "phoneKeypadKeys" in builder
    assert "ivrOptions" in builder
    assert "updateIvrMenuOptions" in builder
    assert "Connect key" in builder
    assert "Audio URL or recording reference" in builder
    assert "Retry message" in builder
    assert "Timeout / no input" in builder
    assert "Invalid input" in builder
    assert "After retries" in builder
    assert "IvrBranchAddButton" in builder
    assert "ivrKeysForNode" in builder
    assert "`digit:${key}`" in builder
    assert "normalizeIvrMenuOptions" in builder


def test_routing_editor_and_runtime_use_structured_reusable_conditions():
    builder = read("src/components/crm-boilerplate/CallRoutingFlowBuilder.tsx")
    routing = read("src/lib/telephony/phone-system-routing.ts")
    conditions = read("src/lib/telephony/routing-conditions.ts")
    queue_route = read("src/app/api/webhooks/twilio/voice/queue/route.ts")

    assert "routingConditionOptions" in builder
    assert "ConditionFields" in builder
    assert "FlowSimulatorPanel" in builder
    assert "simulateRoutingPath" in builder
    assert 'defaults.conditionType = "KNOWN_CONTACT"' in builder
    assert 'conditionType: "OPEN_SALE"' in builder
    assert "evaluateRoutingCondition" in routing
    assert "structuredConditionMatches" in routing
    assert "resolveRoutingFlowRuntimeAction({" in queue_route
    assert "context: routingContext" in queue_route
    for condition_type in [
        '"KNOWN_CONTACT"',
        '"OPEN_SALE"',
        '"ATTRIBUTION_PRESENT"',
        '"TRACKING_NUMBER_PRESENT"',
        '"INBOUND_NUMBER"',
        '"SOURCE"',
        '"CAMPAIGN"',
    ]:
        assert condition_type in conditions


def test_ivr_option_messages_are_runtime_actions_before_key_destination():
    routing = read("src/lib/telephony/phone-system-routing.ts")
    queue_route = read("src/app/api/webhooks/twilio/voice/queue/route.ts")

    assert "IvrRuntimeOption" in routing
    assert "ivrOptionsForNode" in routing
    assert "ivrOptionForDigit(current, digits)" in routing
    assert "routingFlowPendingNodeId: digitNode.id" in routing
    assert "routingFlowPendingMessage: option.message" in routing
    assert 'kind: "message"' in routing
    assert "routingFlowPendingNodeId" in queue_route
    assert "routingFlowIvrOptionLabel" in queue_route
