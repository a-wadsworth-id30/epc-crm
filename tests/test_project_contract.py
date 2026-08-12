from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_required_project_files_exist():
    required = [
        "docker-compose.yml",
        ".env.example",
        "prisma/schema.prisma",
        "prisma/seed.ts",
        "docs/DEVELOPER_DOCS.md",
        "docs/AI_HANDOFF.md",
        "docs/USER_DOCS.md",
    ]

    missing = [path for path in required if not (ROOT / path).exists()]
    assert not missing


def test_no_public_signup_in_sidebar():
    sidebar = (ROOT / "src/layout/AppSidebar.tsx").read_text()
    assert 'path: "/signup"' not in sidebar


def test_twilio_inbound_hangup_uses_assigned_queue_fallback():
    hangup_route = (ROOT / "src/app/api/twilio/voice/hangup/route.ts").read_text()

    assert "findCallToHangUp" in hangup_route
    assert "prisma.callQueueEntry.findFirst" in hangup_route
    assert "assignedUserId: userId" in hangup_route
    assert "client.conferences" in hangup_route


def test_twilio_agent_answer_owns_call_log_without_terminal_overwrite():
    status_route = (
        ROOT / "src/app/api/webhooks/twilio/voice/status/route.ts"
    ).read_text()

    assert "shouldUpdateCallLogStatus" in status_route
    assert 'effectiveStatus === "IN_PROGRESS"' in status_route
    assert "userId: agentUserId" in status_route
    assert 'status: "WAITING"' in status_route
    assert 'voiceAvailability: "AVAILABLE"' in status_route
    assert "isTerminalStatus(effectiveStatus) && !agentUserId" in status_route


def test_inbound_call_stays_in_queue_until_agent_joins():
    voice_route = (ROOT / "src/app/api/webhooks/twilio/voice/route.ts").read_text()

    assert 'status: "WAITING"' in voice_route
    assert "startConferenceOnEnter: false" in voice_route
    assert "waitUrl: queueUrl.toString()" in voice_route
    assert "await restClient.calls.create" not in voice_route[
        voice_route.index("async function handleInbound") :
    ]


def test_browser_agents_expire_without_recent_heartbeat():
    telephony = (ROOT / "src/lib/telephony/twilio-voice.ts").read_text()
    provider = (
        ROOT / "src/components/crm-boilerplate/SoftphoneProvider.tsx"
    ).read_text()

    assert "browserAvailabilityTtlMs" in telephony
    assert 'voiceRoutingMode: { notIn: ["BROWSER", "FLEX"] }' in telephony
    assert "voiceLastSeenAt: { gte: browserSeenAfter }" in telephony
    assert 'availability === "AVAILABLE"' in provider
    assert 'availability: "OFFLINE"' in provider


def test_softphone_server_hangup_precedes_local_disconnect():
    provider = (
        ROOT / "src/components/crm-boilerplate/SoftphoneProvider.tsx"
    ).read_text()
    hangup_start = provider.index("  const hangUp = useCallback")
    hangup_end = provider.index("  const toggleMute = useCallback")
    hangup_block = provider[hangup_start:hangup_end]

    assert 'fetch("/api/twilio/voice/hangup"' in hangup_block
    assert "} finally {\n      disconnectLocalCall();" in hangup_block


def test_softphone_manual_busy_is_not_treated_as_stale_call_busy():
    provider = (
        ROOT / "src/components/crm-boilerplate/SoftphoneProvider.tsx"
    ).read_text()
    availability_route = (
        ROOT / "src/app/api/telephony/availability/route.ts"
    ).read_text()

    assert "manualBusyRef" in provider
    assert '!manualBusyRef.current' in provider
    assert "manual: true" in provider
    assert 'manualBusyRef.current = payload.availability === "BUSY"' in provider
    assert 'mode === "activate" && current?.voiceAvailability === "OFFLINE"' in availability_route
    assert 'body: JSON.stringify({ mode })' in provider
    assert 'void syncAvailabilityHeartbeat("activate")' in provider
    assert "await syncAvailabilityHeartbeat(mode)" in provider


def test_telephony_live_events_force_refresh_status_pages():
    live_refresh = (
        ROOT / "src/components/crm-boilerplate/LivePageRefresh.tsx"
    ).read_text()

    assert 'eventSource = new EventSource(eventSourceUrl)' in live_refresh
    assert 'eventSource.addEventListener("telephony", forceRefresh)' in live_refresh
    assert 'eventSource?.removeEventListener("telephony", forceRefresh)' in live_refresh


def test_call_tracking_inventory_pages_are_admin_only():
    for path in [
        "src/app/(admin)/telephony/call-tracking/overview/page.tsx",
        "src/app/(admin)/telephony/call-tracking/pools/page.tsx",
        "src/app/(admin)/telephony/call-tracking/numbers/page.tsx",
    ]:
        page = (ROOT / path).read_text()

        assert 'import { requireAdmin } from "@/lib/auth";' in page
        assert "await requireAdmin();" in page
