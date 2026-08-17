"use client";

import {
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import type { Call, Device } from "@twilio/voice-sdk";
import gsap from "gsap";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  GripIcon,
  HistoryIcon,
  KeypadIcon,
  MicIcon,
  MicOffIcon,
  NoteIcon,
  PauseIcon,
  PhoneIcon,
  SettingsIcon,
  TransferIcon,
  UsersIcon,
  XIcon,
} from "@/components/crm-boilerplate/SoftphoneIcons";
import type {
  SoftphoneDialDetail,
  SoftphoneDialEvent,
} from "@/lib/telephony/softphone-dial";

type SoftphoneStatus =
  | "closed"
  | "idle"
  | "connecting"
  | "ready"
  | "incoming"
  | "dialing"
  | "in-call"
  | "ended"
  | "error";

type DesktopSoftphoneCommand = {
  id: string;
  type: "dial";
  createdAt: string;
  payload: SoftphoneDialDetail;
};

type SoftphonePosition = {
  x: number;
  y: number;
};

type SoftphoneMorphState = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type DirectoryUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  mobile: string | null;
  landline: string | null;
  sipAddress: string | null;
  voiceRoutingMode: string;
  voiceExtension: string | null;
  voiceAvailability: string;
  canReceiveTransfer: boolean;
  canReceiveInternalCall: boolean;
};

type SoftphoneContact = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  companyName: string | null;
};

type AgentAvailability = "AVAILABLE" | "BUSY" | "AWAY" | "OFFLINE";

const availabilityHeartbeatMs = 4 * 60 * 1000;

type SoftphonePanel =
  | "contacts"
  | "context"
  | "history"
  | "settings"
  | "dial"
  | "transfer"
  | null;

type CallHistoryItem = {
  id: string;
  direction: "Inbound" | "Outbound" | "Internal";
  name: string;
  number: string;
  status: string;
  durationSeconds?: number | null;
  timestamp: string;
};

type CallerContextPayload = {
  matched?: boolean;
  displayName?: string | null;
  phone?: string | null;
  contactId?: string | null;
  contactProfileHref?: string | null;
  email?: string | null;
  role?: string | null;
  companyName?: string | null;
  opportunityId?: string | null;
  opportunityName?: string | null;
  saleProfileHref?: string | null;
  saleSummary?: {
    title: string;
    stage: string;
    valueCents: number;
    currency: string;
    probability: number;
    source?: string | null;
    nextStep?: string | null;
    expectedCloseDate?: string | null;
    ownerName?: string | null;
    latestActivity?: {
      channel: string;
      direction: string;
      summary: string;
      occurredAt: string;
    } | null;
  } | null;
};

type SoftphoneExtensionCapabilities = {
  softphoneUi?: boolean;
  commandBridge?: boolean;
  floatingOverlay?: boolean;
};

type SoftphoneExtensionClient = {
  active: boolean;
  lastSeenAt: number;
  version?: string;
  capabilities: SoftphoneExtensionCapabilities;
};

type SoftphoneExtensionReadyPayload = {
  source?: string;
  version?: string;
  capabilities?: SoftphoneExtensionCapabilities;
};

type SoftphoneExtensionCommandPayload = {
  action?:
    | "answer"
    | "hangup"
    | "mute"
    | "hold"
    | "open"
    | "close"
    | "use-crm-ui"
    | "dial";
  requestId?: string;
  phone?: string;
  contactName?: string;
  contextName?: string;
  opportunityId?: string;
  contactId?: string;
};

type DesktopUpdateState = {
  configured: boolean;
  currentVersion: string;
  latestVersion?: string | null;
  status:
    | "idle"
    | "disabled"
    | "checking"
    | "downloading"
    | "current"
    | "ready"
    | "installing"
    | "error";
  message: string;
  error?: string | null;
  checkedAt?: string | null;
  downloadedAt?: string | null;
  installMode?: "automatic";
};

type SoftphoneExtensionPageState = {
  status: SoftphoneStatus;
  statusLabel: string;
  availability: AgentAvailability;
  targetName: string;
  targetNumber: string;
  contextName: string;
  hasCallInProgress: boolean;
  isMuted: boolean;
  isOnHold: boolean;
  duration: number;
  canAnswer: boolean;
  canHangUp: boolean;
  updatedAt: string;
};

const softphoneContactsPageSize = 12;
const softphoneDirectoryPageSize = 6;
const softphoneHistoryPageSize = 6;
const softphoneExtensionHeartbeatTimeoutMs = 12_000;

const availabilityOptions: Array<{
  value: AgentAvailability;
  label: string;
  dotClassName: string;
}> = [
  { value: "AVAILABLE", label: "Available", dotClassName: "bg-success-500" },
  { value: "AWAY", label: "Away", dotClassName: "bg-warning-500" },
  { value: "BUSY", label: "Busy", dotClassName: "bg-error-500" },
  { value: "OFFLINE", label: "Off", dotClassName: "bg-gray-400" },
];

function isAgentAvailability(value: unknown): value is AgentAvailability {
  return availabilityOptions.some((option) => option.value === value);
}

function canDirectoryUserReceiveTransfer(user: DirectoryUser) {
  if (user.voiceAvailability !== "AVAILABLE") {
    return false;
  }

  if (
    (user.voiceRoutingMode === "BROWSER" || user.voiceRoutingMode === "FLEX") &&
    user.voiceExtension
  ) {
    return true;
  }

  if (user.voiceRoutingMode === "SIP") {
    return Boolean(user.sipAddress);
  }

  if (user.voiceRoutingMode === "LANDLINE") {
    return Boolean(user.landline);
  }

  return Boolean(user.mobile || user.landline || user.sipAddress);
}

function canDirectoryUserReceiveInternalCall(user: DirectoryUser) {
  return (
    user.voiceAvailability === "AVAILABLE" &&
    Boolean(user.voiceExtension) &&
    (user.voiceRoutingMode === "BROWSER" || user.voiceRoutingMode === "FLEX")
  );
}

function directoryAvailabilityDotClass(availability: string) {
  if (availability === "AVAILABLE") {
    return "bg-success-500";
  }

  if (availability === "AWAY") {
    return "bg-warning-500";
  }

  if (availability === "BUSY") {
    return "bg-error-500";
  }

  return "bg-gray-300 dark:bg-gray-700";
}

function userInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

declare global {
  interface WindowEventMap {
    "id30:softphone-extension-ready": CustomEvent<SoftphoneExtensionReadyPayload>;
  }

  interface Window {
    __id30DesktopSoftphoneActive?: boolean;
    id30DesktopSoftphone?: {
      setCompactMode?: (compactMode: boolean) => Promise<unknown>;
      setAlwaysOnTop?: (alwaysOnTop: boolean) => Promise<unknown>;
      getUpdateState?: () => Promise<DesktopUpdateState>;
      checkForUpdates?: () => Promise<DesktopUpdateState>;
      onUpdateState?: (callback: (state: DesktopUpdateState) => void) => () => void;
      setLayout?: (layout: {
        isOpen: boolean;
        hasPanel: boolean;
        showCollapsedCallControls: boolean;
        hasActiveCall?: boolean;
      }) => void;
    };
  }
}

function normalizePhoneNumber(value: string) {
  const normalized = value.trim().replace(/[^\d+]/g, "");

  if (normalized.startsWith("00")) {
    return `+${normalized.slice(2)}`;
  }

  if (normalized.startsWith("0")) {
    return `+44${normalized.slice(1)}`;
  }

  return normalized;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatPanelDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatContextDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatContextMoney(valueCents?: number, currency = "GBP") {
  if (typeof valueCents !== "number") {
    return "Not set";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

function formatStageLabel(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function historyTitle(item: CallHistoryItem) {
  if (
    item.name === "Inbound call" ||
    item.name === "Outbound call" ||
    item.name === "Manual call"
  ) {
    return item.number;
  }

  return item.name || item.number;
}

function incomingCallParameter(call: Call, key: string) {
  const directCustomValue = call.customParameters?.get(key);

  if (directCustomValue) {
    return directCustomValue;
  }

  const directParameterValue = call.parameters[key];

  if (directParameterValue) {
    return directParameterValue;
  }

  const normalizedKey = key.toLowerCase();

  for (const [customKey, customValue] of call.customParameters?.entries() ?? []) {
    if (customKey.toLowerCase() === normalizedKey) {
      return customValue;
    }
  }

  for (const [parameterKey, parameterValue] of Object.entries(call.parameters)) {
    if (parameterKey.toLowerCase() === normalizedKey) {
      return parameterValue;
    }
  }

  return "";
}

type VoiceTokenPayload = {
  token: string;
  identity: string;
};

async function fetchVoiceToken(): Promise<VoiceTokenPayload> {
  const response = await fetch("/api/twilio/voice/token", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as {
    token?: string;
    identity?: string;
    error?: string;
  };

  if (!response.ok || !payload.token) {
    throw new Error(payload.error ?? "Unable to start Twilio voice.");
  }

  return {
    token: payload.token,
    identity: payload.identity ?? "",
  };
}

function softphoneErrorMessage(error: unknown) {
  if (isTwilioRateExceededError(error)) {
    return "Twilio is rate limiting softphone registration. Wait a moment, then reopen the softphone.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: string | number;
      message?: string;
      description?: string;
    };
    const detail = candidate.message ?? candidate.description;

    if (candidate.code === 20101 || String(candidate.code) === "20101") {
      return "Twilio rejected the voice token. Check the Twilio API key SID and Client Secret belong to the same account as the Account SID.";
    }

    if (detail) {
      return candidate.code ? `${detail} (${candidate.code})` : detail;
    }
  }

  return "Unable to start the call.";
}

function isTwilioRateExceededError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string | number;
    name?: string;
    message?: string;
    description?: string;
  };
  const detail =
    `${candidate.name ?? ""} ${candidate.message ?? ""} ${candidate.description ?? ""}`.toLowerCase();

  return (
    String(candidate.code ?? "") === "31206" ||
    detail.includes("rateexceedederror") ||
    detail.includes("rate exceeded") ||
    detail.includes("31206")
  );
}

function isExpiredTwilioAccessToken(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string | number;
    name?: string;
    message?: string;
    description?: string;
  };
  const detail = `${candidate.message ?? ""} ${candidate.description ?? ""}`;

  return (
    String(candidate.code ?? "") === "20104" ||
    candidate.name === "AccessTokenExpired" ||
    (detail.toLowerCase().includes("access token") &&
      detail.toLowerCase().includes("expired"))
  );
}

export default function SoftphoneProvider({
  children,
  currentUserId,
  mode = "floating",
}: {
  children: ReactNode;
  currentUserId: string;
  mode?: "floating" | "standalone";
}) {
  const isStandaloneMode = mode === "standalone";
  const deviceRef = useRef<Device | null>(null);
  const deviceSetupRef = useRef<Promise<Device> | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const incomingCallRef = useRef<Call | null>(null);
  const callStartedAtRef = useRef<number | null>(null);
  const isHangingUpRef = useRef(false);
  const tokenRefreshRef = useRef<Promise<void> | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  const morphStateRef = useRef<SoftphoneMorphState | null>(null);
  const availabilityRef = useRef<AgentAvailability>("OFFLINE");
  const manualBusyRef = useRef(false);
  const desktopSoftphoneActiveRef = useRef(!isStandaloneMode);
  const handledDialRequestIdsRef = useRef<Map<string, number>>(new Map());
  const lastDialRequestRef = useRef<{ signature: string; at: number } | null>(null);
  const [isOpen, setIsOpen] = useState(isStandaloneMode);
  const [status, setStatus] = useState<SoftphoneStatus>("closed");
  const [targetNumber, setTargetNumber] = useState("");
  const [targetName, setTargetName] = useState("");
  const [contextName, setContextName] = useState("");
  const [activeCallLogId, setActiveCallLogId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [hasCallInProgress, setHasCallInProgress] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState<SoftphonePosition | null>(null);
  const [activePanel, setActivePanel] = useState<SoftphonePanel>(null);
  const [renderedPanel, setRenderedPanel] =
    useState<Exclude<SoftphonePanel, null> | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryPage, setDirectoryPage] = useState(1);
  const [contacts, setContacts] = useState<SoftphoneContact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactPage, setContactPage] = useState(1);
  const [contactsError, setContactsError] = useState("");
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyError, setHistoryError] = useState("");
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [callerContext, setCallerContext] =
    useState<CallerContextPayload | null>(null);
  const [isCallerContextLoading, setIsCallerContextLoading] = useState(false);
  const [isGeneratingLead, setIsGeneratingLead] = useState(false);
  const [generateLeadError, setGenerateLeadError] = useState("");
  const [softphoneSettings, setSoftphoneSettings] = useState({
    inboundAnimation: true,
    keepPanelOpen: true,
  });
  const [transferMessage, setTransferMessage] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [availability, setAvailability] =
    useState<AgentAvailability>("OFFLINE");
  const [warmTransferActive, setWarmTransferActive] = useState(false);
  const [, setExtensionClient] =
    useState<SoftphoneExtensionClient | null>(null);
  const [desktopSoftphoneActive, setDesktopSoftphoneActive] =
    useState(!isStandaloneMode);
  const [desktopUpdateState, setDesktopUpdateState] =
    useState<DesktopUpdateState | null>(null);

  const captureSoftphoneMorph = useCallback(() => {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    const rect = shell.getBoundingClientRect();
    morphStateRef.current = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const setIsOpenWithMorph = useCallback(
    (nextOpen: boolean) => {
      captureSoftphoneMorph();
      setIsOpen(nextOpen);
    },
    [captureSoftphoneMorph],
  );

  const closeSoftphoneWithMorph = useCallback(
    ({ collapsePanels = false }: { collapsePanels?: boolean } = {}) => {
      const shell = shellRef.current;

      if (!shell) {
        setIsOpen(false);

        if (collapsePanels) {
          setActivePanel(null);
        }

        return;
      }

      const rect = shell.getBoundingClientRect();
      const margin = window.matchMedia("(min-width: 640px)").matches ? 24 : 16;
      const targetWidth =
        hasCallInProgress ||
        status === "incoming" ||
        status === "dialing" ||
        status === "in-call"
          ? Math.min(352, window.innerWidth - margin * 2)
          : 48;
      const targetHeight =
        hasCallInProgress ||
        status === "incoming" ||
        status === "dialing" ||
        status === "in-call"
          ? 110
          : 48;
      const targetLeft = position?.x ?? window.innerWidth - margin - targetWidth;
      const targetTop = position?.y ?? window.innerHeight - margin - targetHeight;

      morphStateRef.current = null;
      gsap.killTweensOf(shell);
      gsap.set(shell, {
        opacity: 1,
        overflow: "hidden",
        visibility: "visible",
        width: rect.width,
        height: rect.height,
      });
      gsap.to(shell, {
        x: targetLeft - rect.left,
        y: targetTop - rect.top,
        width: targetWidth,
        height: targetHeight,
        opacity: 1,
        overflow: "hidden",
        duration: 0.36,
        ease: "power3.inOut",
        overwrite: true,
        onComplete: () => {
          gsap.set(shell, {
            clearProps: "width,height,overflow,transform,opacity,visibility",
          });
          setIsOpen(false);

          if (collapsePanels) {
            setActivePanel(null);
          }
        },
      });
    },
    [hasCallInProgress, position, status],
  );

  const applyAvailabilityState = useCallback(
    (next: AgentAvailability) => {
      availabilityRef.current = next;
      setAvailability(next);
      setDirectory((current) =>
        current.map((user) => {
          if (user.id !== currentUserId) {
            return user;
          }

          const updatedUser = {
            ...user,
            voiceAvailability: next,
          };

          return {
            ...updatedUser,
            canReceiveTransfer: canDirectoryUserReceiveTransfer(updatedUser),
          };
        }),
      );
    },
    [currentUserId],
  );

  const setServerAvailability = useCallback(
    async (
      next: AgentAvailability,
      options: { manual?: boolean } = {},
    ) => {
      const previous = availabilityRef.current;
      const previousManualBusy = manualBusyRef.current;
      const isManualUpdate = Boolean(options.manual);
      const requestedAvailability =
        !isManualUpdate && next === "AVAILABLE" && manualBusyRef.current
          ? "BUSY"
          : next;

      if (isManualUpdate) {
        manualBusyRef.current = next === "BUSY";
      }

      applyAvailabilityState(requestedAvailability);

      try {
        const response = await fetch("/api/telephony/availability", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({ availability: requestedAvailability }),
        });

        if (!response.ok) {
          throw new Error("Availability update failed.");
        }

        const payload = (await response.json().catch(() => null)) as {
          availability?: unknown;
        } | null;

        if (isAgentAvailability(payload?.availability)) {
          applyAvailabilityState(payload.availability);
          window.dispatchEvent(
            new CustomEvent("id30:softphone-availability-updated", {
              detail: { availability: payload.availability },
            }),
          );
        }
      } catch {
        manualBusyRef.current = previousManualBusy;
        applyAvailabilityState(previous);
      }
    },
    [applyAvailabilityState],
  );

  const syncAvailabilityHeartbeat = useCallback(
    async (mode: "heartbeat" | "activate" = "heartbeat") => {
      try {
        const response = await fetch("/api/telephony/availability", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({ mode }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as {
          availability?: unknown;
        } | null;

        if (isAgentAvailability(payload?.availability)) {
          manualBusyRef.current = payload.availability === "BUSY";
          applyAvailabilityState(payload.availability);
          window.dispatchEvent(
            new CustomEvent("id30:softphone-availability-updated", {
              detail: { availability: payload.availability },
            }),
          );
        }
      } catch {
        // Presence sync is best-effort; explicit user availability changes handle errors.
      }
    },
    [applyAvailabilityState],
  );

  useEffect(() => {
    desktopSoftphoneActiveRef.current = desktopSoftphoneActive;
  }, [desktopSoftphoneActive]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/telephony/availability", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { availability?: unknown } | null) => {
        if (cancelled || !isAgentAvailability(payload?.availability)) {
          return;
        }

        manualBusyRef.current = payload.availability === "BUSY";
        applyAvailabilityState(payload.availability);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [applyAvailabilityState]);

  useEffect(() => {
    if (!isStandaloneMode) {
      return;
    }

    window.__id30DesktopSoftphoneActive = true;

    const sendPresence = (active: boolean) => {
      fetch("/api/telephony/desktop-presence", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ active }),
        keepalive: true,
      }).catch(() => {});
    };

    sendPresence(true);
    const interval = window.setInterval(() => sendPresence(true), 60000);

    return () => {
      window.clearInterval(interval);
      window.__id30DesktopSoftphoneActive = false;
      sendPresence(false);
    };
  }, [isStandaloneMode]);

  useEffect(() => {
    if (isStandaloneMode) {
      return;
    }

    let cancelled = false;

    const checkPresence = () => {
      fetch("/api/telephony/desktop-presence", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { active?: boolean } | null) => {
          if (!cancelled) {
            const active = Boolean(payload?.active);

            window.__id30DesktopSoftphoneActive = active;
            setDesktopSoftphoneActive(active);
          }
        })
        .catch(() => {
          if (!cancelled) {
            window.__id30DesktopSoftphoneActive = false;
            setDesktopSoftphoneActive(false);
          }
        });
    };

    checkPresence();
    const interval = window.setInterval(checkPresence, 60000);

    return () => {
      cancelled = true;
      window.__id30DesktopSoftphoneActive = false;
      window.clearInterval(interval);
    };
  }, [isStandaloneMode]);

  const sendOfflineAvailability = useCallback(() => {
    if (!isStandaloneMode && desktopSoftphoneActiveRef.current) {
      return;
    }

    const payload = JSON.stringify({ availability: "OFFLINE" });

    fetch("/api/telephony/availability", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [isStandaloneMode]);

  const resetCallState = useCallback((nextStatus: SoftphoneStatus = "ended") => {
    activeCallRef.current = null;
    incomingCallRef.current = null;
    callStartedAtRef.current = null;
    isHangingUpRef.current = false;
    setIsMuted(false);
    setIsOnHold(false);
    setHasCallInProgress(false);
    setWarmTransferActive(false);
    setDuration(0);
    setStatus(nextStatus);
  }, []);

  const resetPhoneInterface = useCallback(() => {
    setTargetNumber("");
    setTargetName("");
    setContextName("");
    setActiveCallLogId("");
    setOpportunityId("");
    setContactId("");
    setError("");
    setCallerContext(null);
    setIsCallerContextLoading(false);
    setIsGeneratingLead(false);
    setGenerateLeadError("");
    setActivePanel((current) =>
      current === "dial" || current === "context" ? null : current,
    );
    setTransferMessage("");
    resetCallState("ready");
  }, [resetCallState]);

  const openPanel = useCallback(
    (panel: Exclude<SoftphonePanel, null>) => {
      if (activePanel === panel) {
        setActivePanel(null);
        return;
      }

      setRenderedPanel(panel);
      setActivePanel(panel);
    },
    [activePanel],
  );

  const recordCall = useCallback(
    (item: Omit<CallHistoryItem, "id" | "timestamp">) => {
      setCallHistory((current) => [
        {
          ...item,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 10));
    },
    [],
  );

  const loadCallerContext = useCallback(
    async ({
      phone,
      callLogId,
      contactId,
      opportunityId,
    }: {
      phone?: string;
      callLogId?: string;
      contactId?: string;
      opportunityId?: string;
    }) => {
      const params = new URLSearchParams();

      if (phone) {
        params.set("phone", phone);
      }

      if (callLogId) {
        params.set("callLogId", callLogId);
      }

      if (contactId) {
        params.set("contactId", contactId);
      }

      if (opportunityId) {
        params.set("opportunityId", opportunityId);
      }

      if (!params.toString()) {
        return null;
      }

      const response = await fetch(`/api/telephony/caller-context?${params}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as CallerContextPayload;
    },
    [],
  );

  const hydrateCallerContext = useCallback(
    async ({
      phone,
      callLogId,
      contactId,
      opportunityId,
      showLoadingPanel = false,
    }: {
      phone?: string;
      callLogId?: string;
      contactId?: string;
      opportunityId?: string;
      showLoadingPanel?: boolean;
    }) => {
      if (showLoadingPanel) {
        setRenderedPanel("context");
        setActivePanel("context");
      }

      setIsCallerContextLoading(true);

      try {
        const context = await loadCallerContext({
          phone,
          callLogId,
          contactId,
          opportunityId,
        });

        if (!context) {
          return null;
        }

        setCallerContext(context);
        setRenderedPanel("context");
        setActivePanel("context");

        return context;
      } finally {
        setIsCallerContextLoading(false);
      }
    },
    [loadCallerContext],
  );

  const generateLeadFromCall = useCallback(async () => {
    const phone = callerContext?.phone || targetNumber;

    if (!phone && !activeCallLogId) {
      setGenerateLeadError("Caller number is missing.");
      return;
    }

    setIsGeneratingLead(true);
    setGenerateLeadError("");

    try {
      const response = await fetch("/api/telephony/call-lead", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          callLogId: activeCallLogId || undefined,
          phone: phone || undefined,
          callerName: targetName || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        contactId?: string | null;
        error?: string;
        opportunityId?: string | null;
      } | null;

      if (!response.ok || !payload?.opportunityId) {
        throw new Error(payload?.error || "Lead could not be generated.");
      }

      setContactId(payload.contactId ?? "");
      setOpportunityId(payload.opportunityId);
      const context = await hydrateCallerContext({
        phone,
        callLogId: activeCallLogId || undefined,
        contactId: payload.contactId ?? undefined,
        opportunityId: payload.opportunityId,
        showLoadingPanel: true,
      });

      setContextName(context?.opportunityName ?? "Phone enquiry");
    } catch (leadError) {
      setGenerateLeadError(
        leadError instanceof Error
          ? leadError.message
          : "Lead could not be generated.",
      );
    } finally {
      setIsGeneratingLead(false);
    }
  }, [
    activeCallLogId,
    callerContext?.phone,
    hydrateCallerContext,
    targetName,
    targetNumber,
  ]);

  const updateSoftphoneSetting = useCallback(
    (key: keyof typeof softphoneSettings, value: boolean) => {
      setSoftphoneSettings((current) => ({
        ...current,
        [key]: value,
      }));
    },
    [],
  );

  const isExpectedHangupError = useCallback(
    (candidate: unknown) => {
      if (!candidate || !isHangingUpRef.current) {
        return false;
      }

      if (typeof candidate !== "object") {
        return false;
      }

      const errorWithCode = candidate as {
        code?: number | string;
        message?: string;
        description?: string;
      };
      const message = `${errorWithCode.message ?? ""} ${errorWithCode.description ?? ""}`;

      return (
        String(errorWithCode.code ?? "") === "31005" ||
        message.toUpperCase().includes("HANGUP")
      );
    },
    [],
  );

  const attachCallHandlers = useCallback(
    (call: Call) => {
      call.on("accept", () => {
        callStartedAtRef.current = Date.now();
        incomingCallRef.current = null;
        activeCallRef.current = call;
        setHasCallInProgress(true);
        void setServerAvailability("BUSY");
        setStatus("in-call");
      });
      call.on("disconnect", () => {
        resetCallState("ended");
        void setServerAvailability("AVAILABLE");
      });
      call.on("cancel", () => {
        resetCallState("ended");
        void setServerAvailability("AVAILABLE");
      });
      call.on("reject", () => {
        resetCallState("ended");
        void setServerAvailability("AVAILABLE");
      });
      call.on("error", (callError) => {
        if (isExpectedHangupError(callError)) {
          resetCallState("ended");
          return;
        }

        setError(softphoneErrorMessage(callError));
        resetCallState("error");
        void setServerAvailability("AVAILABLE");
      });
    },
    [isExpectedHangupError, resetCallState, setServerAvailability],
  );

  const refreshDeviceToken = useCallback(async (device: Device) => {
    if (tokenRefreshRef.current) {
      return tokenRefreshRef.current;
    }

    tokenRefreshRef.current = (async () => {
      const refreshed = await fetchVoiceToken();
      device.updateToken(refreshed.token);

      if (device.state === "unregistered") {
        await device.register();
      }

      setError("");
      setStatus((current) =>
        current === "error" || current === "connecting" ? "ready" : current,
      );
    })().finally(() => {
      tokenRefreshRef.current = null;
    });

    return tokenRefreshRef.current;
  }, []);

  const ensureDevice = useCallback(async () => {
    if (deviceSetupRef.current) {
      return deviceSetupRef.current;
    }

    const existingDevice = deviceRef.current;

    if (existingDevice) {
      if (existingDevice.state === "unregistered") {
        try {
          await refreshDeviceToken(existingDevice);
        } catch (refreshError) {
          setError(softphoneErrorMessage(refreshError));
          setStatus("error");
          throw refreshError;
        }
      }

      return existingDevice;
    }

    setStatus("connecting");
    setError("");

    deviceSetupRef.current = (async () => {
      const [{ Device }, tokenPayload] = await Promise.all([
        import("@twilio/voice-sdk"),
        fetchVoiceToken(),
      ]);
      const device = new Device(tokenPayload.token, {
        tokenRefreshMs: 30000,
      });
      deviceRef.current = device;

      device.on("registered", () => {
        setStatus((current) => (current === "connecting" ? "ready" : current));
        void syncAvailabilityHeartbeat("activate");
      });
      device.on("unregistered", () => {
        if (availabilityRef.current === "AVAILABLE") {
          setStatus("connecting");
          window.setTimeout(() => {
            void refreshDeviceToken(device).catch((refreshError) => {
              setError(softphoneErrorMessage(refreshError));
              setStatus("error");
              void setServerAvailability("OFFLINE");
            });
          }, 1000);
          return;
        }

        void setServerAvailability("OFFLINE");
      });
      device.on("error", (deviceError) => {
        if (isTwilioRateExceededError(deviceError)) {
          setError(softphoneErrorMessage(deviceError));
          setStatus("error");
          void setServerAvailability("OFFLINE");
          return;
        }

        if (isExpiredTwilioAccessToken(deviceError)) {
          setStatus("connecting");
          void refreshDeviceToken(device).catch((refreshError) => {
            setError(softphoneErrorMessage(refreshError));
            setStatus("error");
            void setServerAvailability("OFFLINE");
          });
          return;
        }

        setError(softphoneErrorMessage(deviceError));
        setStatus("error");
        void setServerAvailability("OFFLINE");
      });
      device.on("tokenWillExpire", async () => {
        try {
          await refreshDeviceToken(device);
        } catch (refreshError) {
          setError(softphoneErrorMessage(refreshError));
          setStatus("error");
        }
      });
      device.on("incoming", (call) => {
        const callLogId = incomingCallParameter(call, "CallLogId");
        const isInternalCall =
          incomingCallParameter(call, "InternalCall").toLowerCase() === "true";
        const callerNumber =
          incomingCallParameter(call, "CallerNumber") ||
          incomingCallParameter(call, "From") ||
          incomingCallParameter(call, "Caller") ||
          (call.parameters.CallSid ?? "Incoming call");
        const callerName =
          incomingCallParameter(call, "CallerName") ||
          (isInternalCall ? "Internal call" : "Incoming call");
        const incomingContextName =
          incomingCallParameter(call, "OpportunityName") ||
          (isInternalCall ? "Internal call" : "");
        const incomingContactId = incomingCallParameter(call, "ContactId");
        const incomingOpportunityId = incomingCallParameter(call, "OpportunityId");

        incomingCallRef.current = call;
        activeCallRef.current = call;
        setIsOpenWithMorph(true);
        setError("");
        setTargetName(callerName);
        setTargetNumber(callerNumber);
        setContextName(incomingContextName);
        setActiveCallLogId(callLogId);
        setContactId(incomingContactId);
        setOpportunityId(incomingOpportunityId);
        setCallerContext(null);
        setGenerateLeadError("");
        setHasCallInProgress(true);
        setActivePanel((current) => (current === "dial" ? null : current));
        setStatus("incoming");
        recordCall({
          direction: isInternalCall ? "Internal" : "Inbound",
          name: callerName,
          number: callerNumber,
          status: "Ringing",
        });

        if (isInternalCall) {
          attachCallHandlers(call);
          return;
        }

        void hydrateCallerContext({
          phone: callerNumber,
          callLogId,
          contactId: incomingContactId,
          opportunityId: incomingOpportunityId,
          showLoadingPanel: Boolean(incomingContactId || incomingOpportunityId),
        })
          .then((context) => {
            if (!context || incomingCallRef.current !== call) {
              return;
            }

            const nextName =
              context.displayName ||
              (callerName === "Incoming call" ? callerNumber : callerName);
            const nextNumber = context.phone || callerNumber;

            setTargetName(nextName);
            setTargetNumber(nextNumber);
            setContactId(context.contactId ?? incomingContactId);
            setOpportunityId(context.opportunityId ?? incomingOpportunityId);
            setContextName(context.opportunityName ?? incomingContextName);
            setCallHistory((current) =>
              current.map((item, index) =>
                index === 0 && item.status === "Ringing"
                  ? { ...item, name: nextName, number: nextNumber }
                  : item,
              ),
            );
          })
          .catch(() => {});
        attachCallHandlers(call);
      });

      try {
        await device.register();
      } catch (registerError) {
        if (deviceRef.current === device) {
          deviceRef.current = null;
        }

        device.destroy();
        setError(softphoneErrorMessage(registerError));
        setStatus("error");
        throw registerError;
      }

      setStatus("ready");
      void syncAvailabilityHeartbeat("activate");

      return device;
    })().finally(() => {
      deviceSetupRef.current = null;
    });

    return deviceSetupRef.current;
  }, [
    attachCallHandlers,
    hydrateCallerContext,
    recordCall,
    refreshDeviceToken,
    setServerAvailability,
    syncAvailabilityHeartbeat,
    setIsOpenWithMorph,
  ]);

  const syncRouteableDeviceHeartbeat = useCallback(
    async (mode: "heartbeat" | "activate" = "heartbeat") => {
      if (availabilityRef.current !== "AVAILABLE" && mode !== "activate") {
        return;
      }

      try {
        const device = await ensureDevice();

        if (device.state !== "registered") {
          await refreshDeviceToken(device);
        }

        if (device.state === "registered") {
          await syncAvailabilityHeartbeat(mode);
        }
      } catch {
        if (availabilityRef.current === "AVAILABLE") {
          void setServerAvailability("OFFLINE");
        }
      }
    },
    [
      ensureDevice,
      refreshDeviceToken,
      setServerAvailability,
      syncAvailabilityHeartbeat,
    ],
  );

  const startCall = useCallback(
    async (
      phoneOverride?: string,
      nameOverride?: string,
      contextOverride?: {
        contextName?: string;
        opportunityId?: string;
        contactId?: string;
      },
    ) => {
      const phone = normalizePhoneNumber(phoneOverride ?? targetNumber);

      if (!phone) {
        setError("Enter a phone number to call.");
        setStatus("error");
        setRenderedPanel("dial");
        setActivePanel("dial");
        return;
      }

      if (
        hasCallInProgress ||
        status === "incoming" ||
        status === "dialing" ||
        status === "in-call"
      ) {
        setIsOpenWithMorph(true);
        return;
      }

      try {
        const nextContextName = contextOverride?.contextName ?? contextName;
        const nextOpportunityId =
          contextOverride?.opportunityId ?? opportunityId;
        const nextContactId = contextOverride?.contactId ?? contactId;

        setIsOpenWithMorph(true);
        setActivePanel((current) => (current === "dial" ? null : current));
        setError("");
        setTargetNumber(phone);
        setTargetName(nameOverride ?? targetName);
        setContextName(nextContextName);
        setOpportunityId(nextOpportunityId);
        setContactId(nextContactId);
        setCallerContext(null);
        setHasCallInProgress(true);
        void setServerAvailability("BUSY");
        setStatus("dialing");
        recordCall({
          direction: "Outbound",
          name: (nameOverride ?? targetName) || phone,
          number: phone,
          status: "Dialling",
        });
        void hydrateCallerContext({
          phone,
          contactId: nextContactId,
          opportunityId: nextOpportunityId,
          showLoadingPanel: Boolean(nextContactId || nextOpportunityId),
        }).catch(() => {});

        const device = await ensureDevice();
        const call = await device.connect({
          params: {
            To: phone,
            ...(nextOpportunityId
              ? { OpportunityId: nextOpportunityId }
              : {}),
            ...(nextContactId ? { ContactId: nextContactId } : {}),
          },
        });

        activeCallRef.current = call;
        attachCallHandlers(call);
      } catch (callError) {
        activeCallRef.current = null;
        incomingCallRef.current = null;
        setError(softphoneErrorMessage(callError));
        isHangingUpRef.current = false;
        setHasCallInProgress(false);
        setStatus("error");
        void setServerAvailability("AVAILABLE");
      }
    },
    [
      contactId,
      contextName,
      attachCallHandlers,
      ensureDevice,
      hasCallInProgress,
      hydrateCallerContext,
      opportunityId,
      recordCall,
      setServerAvailability,
      setIsOpenWithMorph,
      status,
      targetName,
      targetNumber,
    ],
  );

  const acceptDialRequest = useCallback(
    (detail: SoftphoneDialDetail) => {
      const now = Date.now();
      const handledRequestIds = handledDialRequestIdsRef.current;

      for (const [requestId, handledAt] of handledRequestIds) {
        if (now - handledAt > 60_000) {
          handledRequestIds.delete(requestId);
        }
      }

      if (detail.requestId) {
        if (handledRequestIds.has(detail.requestId)) {
          return;
        }

        handledRequestIds.set(detail.requestId, now);
      }

      const signature = JSON.stringify({
        phone: detail.phone,
        contactName: detail.contactName ?? "",
        contextName: detail.contextName ?? "",
        opportunityId: detail.opportunityId ?? "",
        contactId: detail.contactId ?? "",
      });
      const lastRequest = lastDialRequestRef.current;

      if (
        lastRequest?.signature === signature &&
        now - lastRequest.at < 5000
      ) {
        return;
      }

      lastDialRequestRef.current = { signature, at: now };
      void startCall(detail.phone, detail.contactName, {
        contextName: detail.contextName,
        opportunityId: detail.opportunityId,
        contactId: detail.contactId,
      });
    },
    [startCall],
  );

  const startInternalCall = useCallback(
    async (user: DirectoryUser) => {
      if (
        user.id === currentUserId ||
        !user.canReceiveInternalCall ||
        hasCallInProgress ||
        status === "incoming" ||
        status === "dialing" ||
        status === "in-call" ||
        status === "connecting"
      ) {
        setIsOpenWithMorph(true);
        return;
      }

      const targetLabel = user.voiceExtension
        ? `Ext ${user.voiceExtension}`
        : "Internal call";

      try {
        setIsOpenWithMorph(true);
        setActivePanel((current) => (current === "transfer" ? null : current));
        setError("");
        setTargetNumber(targetLabel);
        setTargetName(user.displayName);
        setContextName("Internal call");
        setOpportunityId("");
        setContactId("");
        setCallerContext(null);
        setHasCallInProgress(true);
        void setServerAvailability("BUSY");
        setStatus("dialing");
        recordCall({
          direction: "Internal",
          name: user.displayName,
          number: targetLabel,
          status: "Dialling",
        });

        const device = await ensureDevice();
        const call = await device.connect({
          params: {
            InternalUserId: user.id,
          },
        });

        activeCallRef.current = call;
        attachCallHandlers(call);
      } catch (callError) {
        activeCallRef.current = null;
        incomingCallRef.current = null;
        setError(softphoneErrorMessage(callError));
        isHangingUpRef.current = false;
        setHasCallInProgress(false);
        setStatus("error");
        void setServerAvailability("AVAILABLE");
      }
    },
    [
      attachCallHandlers,
      currentUserId,
      ensureDevice,
      hasCallInProgress,
      recordCall,
      setIsOpenWithMorph,
      setServerAvailability,
      status,
    ],
  );

  useEffect(() => {
    if (!isStandaloneMode || hasCallInProgress) {
      return;
    }

    let cancelled = false;
    let polling = false;

    const pollDesktopCommand = async () => {
      if (polling) {
        return;
      }

      polling = true;

      try {
        const response = await fetch("/api/telephony/desktop-command", {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          cache: "no-store",
        });

        if (!response.ok || cancelled) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as {
          command?: DesktopSoftphoneCommand | null;
        } | null;
        const command = payload?.command;

        if (command?.type !== "dial" || !command.payload?.phone) {
          return;
        }

        void startCall(command.payload.phone, command.payload.contactName, {
          contextName: command.payload.contextName,
          opportunityId: command.payload.opportunityId,
          contactId: command.payload.contactId,
        });
      } finally {
        polling = false;
      }
    };

    void pollDesktopCommand();
    const interval = window.setInterval(pollDesktopCommand, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasCallInProgress, isStandaloneMode, startCall]);

  const answerIncoming = useCallback(() => {
    const incomingCall = incomingCallRef.current;

    if (!incomingCall) {
      return;
    }

    setError("");
    void setServerAvailability("BUSY");
    incomingCall.accept();
  }, [setServerAvailability]);

  const disconnectLocalCall = useCallback(() => {
    if (incomingCallRef.current) {
      isHangingUpRef.current = true;
      incomingCallRef.current.reject();
      resetCallState("ended");
      void setServerAvailability("AVAILABLE");
      return;
    }

    if (activeCallRef.current) {
      isHangingUpRef.current = true;
      activeCallRef.current.disconnect();
      return;
    }

    deviceRef.current?.disconnectAll();
    resetCallState("ended");
    void setServerAvailability("AVAILABLE");
  }, [resetCallState, setServerAvailability]);

  const completeWarmTransfer = useCallback(async () => {
    try {
      const response = await fetch("/api/twilio/voice/transfer/complete", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          opportunityId: opportunityId || null,
          contactId: contactId || null,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to complete warm transfer.");
      }

      disconnectLocalCall();
      resetCallState("ended");
      void setServerAvailability("AVAILABLE");
    } catch (transferError) {
      setTransferMessage(softphoneErrorMessage(transferError));
    }
  }, [
    contactId,
    disconnectLocalCall,
    opportunityId,
    resetCallState,
    setServerAvailability,
  ]);

  const hangUp = useCallback(async () => {
    if (warmTransferActive) {
      await completeWarmTransfer();
      return;
    }

    if (incomingCallRef.current) {
      disconnectLocalCall();
      return;
    }

    const shouldEndServerCall = Boolean(
      activeCallRef.current || hasCallInProgress,
    );
    const currentOpportunityId = opportunityId || null;
    const currentContactId = contactId || null;

    if (!shouldEndServerCall) {
      disconnectLocalCall();
      return;
    }

    try {
      const response = await fetch("/api/twilio/voice/hangup", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          opportunityId: currentOpportunityId,
          contactId: currentContactId,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to hang up the Twilio call.");
      }
    } catch (hangupError) {
      setError(softphoneErrorMessage(hangupError));
      setStatus("error");
    } finally {
      disconnectLocalCall();
    }
  }, [
    contactId,
    completeWarmTransfer,
    disconnectLocalCall,
    hasCallInProgress,
    opportunityId,
    warmTransferActive,
  ]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    activeCallRef.current?.mute(nextMuted);
    setIsMuted(nextMuted);
  }, [isMuted]);

  const toggleHold = useCallback(async () => {
    const nextHold = !isOnHold;

    try {
      setTransferMessage("");
      const response = await fetch("/api/twilio/voice/hold", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hold: nextHold,
          opportunityId: opportunityId || null,
          contactId: contactId || null,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update hold.");
      }

      setIsOnHold(nextHold);
    } catch (holdError) {
      setTransferMessage(softphoneErrorMessage(holdError));
    }
  }, [contactId, isOnHold, opportunityId]);

  useEffect(() => {
    const handleExtensionCommand = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as {
        source?: string;
        type?: string;
        payload?: SoftphoneExtensionCommandPayload;
      };

      if (
        data?.source !== "id30-crm-extension" ||
        data.type !== "SOFTPHONE_COMMAND"
      ) {
        return;
      }

      const action = data.payload?.action;

      if (action === "answer") {
        answerIncoming();
        return;
      }

      if (action === "hangup") {
        void hangUp();
        return;
      }

      if (action === "mute") {
        toggleMute();
        return;
      }

      if (action === "hold") {
        void toggleHold();
        return;
      }

      if (action === "open") {
        setIsOpenWithMorph(true);
        return;
      }

      if (action === "close") {
        closeSoftphoneWithMorph({
          collapsePanels: !softphoneSettings.keepPanelOpen,
        });
        return;
      }

      if (action === "use-crm-ui") {
        setIsOpenWithMorph(true);
        return;
      }

      if (action === "dial" && data.payload?.phone) {
        setIsOpenWithMorph(true);
        acceptDialRequest({
          requestId: data.payload.requestId,
          phone: data.payload.phone,
          contactName: data.payload.contactName,
          contextName: data.payload.contextName,
          opportunityId: data.payload.opportunityId,
          contactId: data.payload.contactId,
        });
      }
    };

    window.addEventListener("message", handleExtensionCommand);
    return () => window.removeEventListener("message", handleExtensionCommand);
  }, [
    answerIncoming,
    acceptDialRequest,
    closeSoftphoneWithMorph,
    hangUp,
    setIsOpenWithMorph,
    softphoneSettings.keepPanelOpen,
    toggleHold,
    toggleMute,
  ]);

  const loadDirectory = useCallback(async () => {
    const response = await fetch("/api/telephony/directory", {
      headers: { Accept: "application/json" },
    });
    const payload = (await response.json()) as {
      users?: DirectoryUser[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load staff directory.");
    }

    const users = payload.users ?? [];

    setDirectory(
      users.map((user) => {
        if (user.id !== currentUserId) {
          return user;
        }

        const updatedUser = {
          ...user,
          voiceAvailability: availabilityRef.current,
        };

        return {
          ...updatedUser,
          canReceiveTransfer: canDirectoryUserReceiveTransfer(updatedUser),
          canReceiveInternalCall: canDirectoryUserReceiveInternalCall(updatedUser),
        };
      }),
    );
  }, [currentUserId]);

  const loadContacts = useCallback(async () => {
    const response = await fetch("/api/contacts", {
      headers: { Accept: "application/json" },
    });
    const payload = (await response.json()) as {
      contacts?: SoftphoneContact[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load contacts.");
    }

    setContacts(payload.contacts ?? []);
    setContactsError("");
  }, []);

  const loadHistory = useCallback(async () => {
    setIsHistoryLoading(true);

    try {
      const response = await fetch("/api/telephony/history", {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as {
        calls?: CallHistoryItem[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load call history.");
      }

      setCallHistory(payload.calls ?? []);
      setHistoryError("");
      setHistoryPage(1);
    } catch (historyLoadError) {
      setHistoryError(softphoneErrorMessage(historyLoadError));
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  const startTransfer = useCallback(
    async (targetUserId: string, transferType: "warm" | "cold") => {
      try {
        setIsTransferring(true);
        setTransferMessage("");
        const response = await fetch("/api/twilio/voice/transfer", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetUserId,
            transferType,
            opportunityId: opportunityId || null,
            contactId: contactId || null,
          }),
        });
        const payload = (await response.json()) as {
          message?: string;
          error?: string;
          warmTransferActive?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to start transfer.");
        }

        setTransferMessage(payload.message ?? "Transfer started.");
        setWarmTransferActive(Boolean(payload.warmTransferActive));
        setIsOnHold(Boolean(payload.warmTransferActive));

        if (transferType === "cold") {
          disconnectLocalCall();
        }
      } catch (transferError) {
        setTransferMessage(softphoneErrorMessage(transferError));
      } finally {
        setIsTransferring(false);
      }
    },
    [contactId, disconnectLocalCall, opportunityId],
  );

  const clampPosition = useCallback((
    nextX: number,
    nextY: number,
    width: number,
    height: number,
  ) => {
    const margin = 16;
    const maxX = Math.max(margin, window.innerWidth - width - margin);
    const maxY = Math.max(margin, window.innerHeight - height - margin);

    return {
      x: Math.min(Math.max(nextX, margin), maxX),
      y: Math.min(Math.max(nextY, margin), maxY),
    };
  }, []);

  const startDrag = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const dragTarget = event.currentTarget.closest(
        "[data-softphone-drag-target]",
      );
      const rect = dragTarget?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      event.preventDefault();

      const { height, left, top, width } = rect;
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = left;
      const originY = top;

      function handleMouseMove(moveEvent: MouseEvent) {
        setPosition(
          clampPosition(
            originX + moveEvent.clientX - startX,
            originY + moveEvent.clientY - startY,
            width,
            height,
          ),
        );
      }

      function handleMouseUp() {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      }

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [clampPosition],
  );

  const markExtensionReady = useCallback(
    (payload: SoftphoneExtensionReadyPayload = {}) => {
      setExtensionClient({
        active: true,
        lastSeenAt: Date.now(),
        version: payload.version,
        capabilities: {
          softphoneUi: false,
          commandBridge: Boolean(payload.capabilities?.commandBridge),
          floatingOverlay: Boolean(payload.capabilities?.floatingOverlay),
        },
      });
    },
    [],
  );

  const postExtensionBridgeMessage = useCallback((type: string, payload = {}) => {
    window.postMessage(
      {
        source: "id30-crm-page",
        type,
        payload,
      },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    ensureDevice().catch(() => {
      // Keep setup errors inside the softphone; the rest of the CRM should load.
    });
  }, [ensureDevice]);

  useEffect(() => {
    const announcePageReady = () => {
      postExtensionBridgeMessage("PAGE_READY", {
        userId: currentUserId,
        requestedAt: new Date().toISOString(),
      });
      window.dispatchEvent(
        new CustomEvent("id30:softphone-page-ready", {
          detail: { userId: currentUserId },
        }),
      );
    };

    const handleExtensionReady = (
      event: WindowEventMap["id30:softphone-extension-ready"],
    ) => {
      markExtensionReady(event.detail);
    };

    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as {
        source?: string;
        type?: string;
        payload?: SoftphoneExtensionReadyPayload;
      };

      if (data?.source !== "id30-crm-extension") {
        return;
      }

      if (data.type === "READY" || data.type === "HEARTBEAT") {
        markExtensionReady(data.payload ?? {});
      }
    };

    window.addEventListener("message", handleExtensionMessage);
    window.addEventListener(
      "id30:softphone-extension-ready",
      handleExtensionReady,
    );

    announcePageReady();
    const announceTimeout = window.setTimeout(announcePageReady, 800);
    const heartbeatInterval = window.setInterval(() => {
      setExtensionClient((current) => {
        if (!current?.active) {
          return current;
        }

        if (Date.now() - current.lastSeenAt <= softphoneExtensionHeartbeatTimeoutMs) {
          return current;
        }

        return {
          ...current,
          active: false,
        };
      });
    }, 3000);

    return () => {
      window.clearTimeout(announceTimeout);
      window.clearInterval(heartbeatInterval);
      window.removeEventListener("message", handleExtensionMessage);
      window.removeEventListener(
        "id30:softphone-extension-ready",
        handleExtensionReady,
      );
    };
  }, [
    currentUserId,
    markExtensionReady,
    postExtensionBridgeMessage,
  ]);

  useEffect(() => {
    const shouldRecover =
      status === "in-call" ||
      status === "error" ||
      (availability === "BUSY" &&
        !manualBusyRef.current &&
        status !== "dialing" &&
        status !== "incoming");

    const recoverSoftphoneState = () => {
      fetch("/api/twilio/voice/recover", {
        method: "POST",
        headers: { Accept: "application/json" },
      })
        .then((response) => response.json())
        .then((payload: { active?: boolean }) => {
          if (payload.active === false) {
            try {
              incomingCallRef.current?.reject();
            } catch {
              // The Twilio leg may already be gone by the time recovery runs.
            }

            try {
              activeCallRef.current?.disconnect();
            } catch {
              // The local SDK state is best-effort during remote hangups.
            }

            resetCallState("ended");
            void setServerAvailability("AVAILABLE");
          }
        })
        .catch(() => {});
    };

    if (shouldRecover) {
      recoverSoftphoneState();
    }

    const interval = window.setInterval(() => {
      if (availabilityRef.current === "AVAILABLE") {
        void syncRouteableDeviceHeartbeat();
      }

      if (shouldRecover) {
        recoverSoftphoneState();
      }
    }, shouldRecover ? 60_000 : availabilityHeartbeatMs);

    return () => window.clearInterval(interval);
  }, [
    availability,
    resetCallState,
    setServerAvailability,
    status,
    syncRouteableDeviceHeartbeat,
  ]);

  useEffect(() => {
    if (availability !== "AVAILABLE" || hasCallInProgress) {
      return;
    }

    void syncRouteableDeviceHeartbeat("activate");
  }, [availability, hasCallInProgress, syncRouteableDeviceHeartbeat]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (
        document.visibilityState === "visible" &&
        availabilityRef.current === "AVAILABLE"
      ) {
        void syncRouteableDeviceHeartbeat();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", sendOfflineAvailability);
    window.addEventListener("beforeunload", sendOfflineAvailability);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", sendOfflineAvailability);
      window.removeEventListener("beforeunload", sendOfflineAvailability);
    };
  }, [sendOfflineAvailability, syncRouteableDeviceHeartbeat]);

  useEffect(() => {
    function handleDial(event: SoftphoneDialEvent) {
      acceptDialRequest(event.detail);
    }

    window.addEventListener("crm-softphone:dial", handleDial);
    return () => window.removeEventListener("crm-softphone:dial", handleDial);
  }, [acceptDialRequest]);

  useEffect(() => {
    if (activePanel !== "transfer") {
      return;
    }

    loadDirectory().catch((directoryError) => {
      setTransferMessage(softphoneErrorMessage(directoryError));
    });

    const interval = window.setInterval(() => {
      loadDirectory().catch(() => {});
    }, 10000);

    return () => window.clearInterval(interval);
  }, [activePanel, availability, loadDirectory]);

  useEffect(() => {
    if (activePanel !== "contacts" || contacts.length > 0) {
      return;
    }

    loadContacts().catch((contactsLoadError) => {
      setContactsError(softphoneErrorMessage(contactsLoadError));
    });
  }, [activePanel, contacts.length, loadContacts]);

  useEffect(() => {
    if (activePanel !== "history") {
      return;
    }

    void loadHistory();
  }, [activePanel, loadHistory]);

  useEffect(() => {
    if (activePanel !== "history" || status !== "ended") {
      return;
    }

    void loadHistory();
  }, [activePanel, loadHistory, status]);

  useEffect(() => {
    const saved = window.localStorage.getItem("id30-softphone-settings");

    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Partial<typeof softphoneSettings>;
      setSoftphoneSettings((current) => ({ ...current, ...parsed }));
    } catch {
      window.localStorage.removeItem("id30-softphone-settings");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "id30-softphone-settings",
      JSON.stringify(softphoneSettings),
    );
  }, [softphoneSettings]);

  useEffect(() => {
    if (activePanel) {
      setRenderedPanel(activePanel);
    }
  }, [activePanel]);

  useEffect(() => {
    const hasLiveCallContext =
      hasCallInProgress ||
      status === "incoming" ||
      status === "dialing" ||
      status === "in-call";

    if (hasLiveCallContext) {
      return;
    }

    setCallerContext(null);
    setIsCallerContextLoading(false);
    setActivePanel((current) => (current === "context" ? null : current));
  }, [hasCallInProgress, status]);

  useLayoutEffect(() => {
    const panel = sidePanelRef.current;

    if (!panel || !renderedPanel) {
      return;
    }

    gsap.killTweensOf(panel);

    if (activePanel) {
      gsap.fromTo(
        panel,
        {
          autoAlpha: 0,
          x: 28,
          scale: 0.985,
        },
        {
          autoAlpha: 1,
          x: 0,
          scale: 1,
          duration: 0.24,
          ease: "power3.out",
        },
      );
      return;
    }

    gsap.to(panel, {
      autoAlpha: 0,
      x: 28,
      scale: 0.985,
      duration: 0.18,
      ease: "power2.in",
      onComplete: () => setRenderedPanel(null),
    });

    return () => {
      gsap.killTweensOf(panel);
    };
  }, [activePanel, renderedPanel]);

  useLayoutEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    const previousRect = morphStateRef.current;
    morphStateRef.current = null;
    gsap.killTweensOf(shell);
    gsap.set(shell, { opacity: 1, visibility: "visible" });

    if (previousRect) {
      const nextRect = shell.getBoundingClientRect();

      gsap.fromTo(
        shell,
        {
          x: previousRect.left - nextRect.left,
          y: previousRect.top - nextRect.top,
          width: previousRect.width,
          height: previousRect.height,
          opacity: 1,
          overflow: "hidden",
        },
        {
          x: 0,
          y: 0,
          width: nextRect.width,
          height: nextRect.height,
          opacity: 1,
          overflow: "hidden",
          clearProps: "width,height,overflow,transform,opacity,visibility",
          transformOrigin: "right bottom",
          overwrite: true,
          force3D: true,
          immediateRender: true,
          duration: 0.36,
          ease: "power3.inOut",
        },
      );
      return;
    }

    if (!shell.dataset.softphoneAnimated) {
      shell.dataset.softphoneAnimated = "true";
      gsap.fromTo(
        shell,
        {
          opacity: 0,
          y: isOpen ? 18 : 10,
          scale: 0.985,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.36,
          ease: "power3.out",
          clearProps: "transform,opacity,visibility",
        },
      );
    }

    return () => {
      gsap.killTweensOf(shell);
    };
  }, [hasCallInProgress, isOpen, status]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!callStartedAtRef.current) {
        return;
      }

      setDuration(Math.floor((Date.now() - callStartedAtRef.current) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status !== "ended") {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (activeCallLogId && callerContext && !callerContext.matched) {
        setStatus("ready");
        return;
      }

      resetPhoneInterface();
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [activeCallLogId, callerContext, resetPhoneInterface, status]);

  useEffect(() => {
    return () => {
      activeCallRef.current?.disconnect();
      deviceRef.current?.destroy();
      sendOfflineAvailability();
    };
  }, [sendOfflineAvailability]);

  const statusLabel =
    status === "closed"
      ? "Ready"
      : status === "connecting"
        ? "Connecting"
        : status === "incoming"
          ? "Incoming"
          : status === "dialing"
          ? "Dialling"
          : status === "in-call"
            ? "In call"
            : status === "error"
              ? "Error"
              : status === "ended"
                ? "Call ended"
                : "Ready";
  const isCalling =
    status === "incoming" || status === "dialing" || status === "in-call";
  const isIncoming = status === "incoming";
  const isEnded = status === "ended";
  const availabilityLabel =
    availabilityOptions.find((option) => option.value === availability)?.label ??
    "Ready";
  const showAvailabilityStatus =
    !isCalling &&
    status !== "connecting" &&
    status !== "error" &&
    status !== "ended";
  const headerStatusLabel = showAvailabilityStatus
    ? availabilityLabel
    : statusLabel;
  const hasTarget = Boolean(targetNumber);
  const canGenerateLeadFromCall = Boolean(
    callerContext &&
      !callerContext.contactId &&
      !callerContext.opportunityId &&
      (activeCallLogId || callerContext.phone || targetNumber),
  );
  const filteredDirectory = directory
    .filter((user) => {
      const query = directorySearch.trim().toLowerCase();

      if (!query) return true;

      return [
        user.displayName,
        user.email,
        user.mobile,
        user.landline,
        user.voiceExtension,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query));
    });
  const directoryTotalPages = Math.max(
    1,
    Math.ceil(filteredDirectory.length / softphoneDirectoryPageSize),
  );
  const currentDirectoryPage = Math.min(directoryPage, directoryTotalPages);
  const visibleDirectory = filteredDirectory.slice(
    (currentDirectoryPage - 1) * softphoneDirectoryPageSize,
    currentDirectoryPage * softphoneDirectoryPageSize,
  );
  const filteredContacts = contacts
    .filter((contact) => {
      const query = contactSearch.trim().toLowerCase();

      if (!query) return true;

      return [
        contact.displayName,
        contact.companyName,
        contact.role,
        contact.email,
        contact.phone,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query));
    });
  const contactTotalPages = Math.max(
    1,
    Math.ceil(filteredContacts.length / softphoneContactsPageSize),
  );
  const currentContactPage = Math.min(contactPage, contactTotalPages);
  const visibleContacts = filteredContacts.slice(
    (currentContactPage - 1) * softphoneContactsPageSize,
    currentContactPage * softphoneContactsPageSize,
  );
  const historyTotalPages = Math.max(
    1,
    Math.ceil(callHistory.length / softphoneHistoryPageSize),
  );
  const currentHistoryPage = Math.min(historyPage, historyTotalPages);
  const visibleHistory = callHistory.slice(
    (currentHistoryPage - 1) * softphoneHistoryPageSize,
    currentHistoryPage * softphoneHistoryPageSize,
  );
  const visiblePanel = renderedPanel ?? activePanel;
  const canShowContextPanel =
    visiblePanel !== "context" ||
    isCallerContextLoading ||
    Boolean(callerContext) ||
    hasCallInProgress ||
    isCalling;
  const hasPanel = Boolean(visiblePanel && canShowContextPanel);
  const showIncomingAnimation =
    isIncoming && softphoneSettings.inboundAnimation && !hasPanel;
  const panelTitle =
    visiblePanel === "contacts"
      ? "Contacts"
      : visiblePanel === "context"
        ? "Call context"
      : visiblePanel === "history"
        ? "History"
        : visiblePanel === "settings"
          ? "Softphone settings"
        : visiblePanel === "transfer"
            ? status === "in-call"
              ? "Transfer call"
              : "Staff"
            : visiblePanel === "dial"
              ? "Dial keypad"
              : "";
  const panelIcon =
    visiblePanel === "contacts" ? (
      <UsersIcon className="h-4 w-4" />
    ) : visiblePanel === "context" ? (
      <NoteIcon className="h-4 w-4" />
    ) : visiblePanel === "history" ? (
      <HistoryIcon className="h-4 w-4" />
    ) : visiblePanel === "settings" ? (
      <SettingsIcon className="h-4 w-4" />
    ) : visiblePanel === "transfer" ? (
      <TransferIcon className="h-4 w-4" />
    ) : (
      <KeypadIcon className="h-4 w-4" />
    );
  const keypadButtons = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "#"];
  const canCancelCall =
    hasCallInProgress ||
    status === "connecting" ||
    status === "incoming" ||
    status === "dialing" ||
    status === "in-call" ||
    status === "error";
  const hasSetupError =
    status === "error" &&
    /twilio|twiml|api key|caller id|telephony|configured/i.test(error);
  const statusPillClass =
    status === "error"
      ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
      : status === "connecting" || status === "dialing"
        ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
        : showAvailabilityStatus && availability === "AWAY"
          ? "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
        : showAvailabilityStatus && availability === "BUSY"
          ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
        : showAvailabilityStatus && availability === "OFFLINE"
          ? "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
        : isCalling || status === "ready" || status === "idle" || status === "closed"
        ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
        : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300";
  const showCollapsedCallControls =
    !isOpen &&
    (hasCallInProgress ||
      status === "incoming" ||
      status === "dialing" ||
      status === "in-call");
  const collapsedCallTitle =
    targetName || targetNumber || (status === "incoming" ? "Incoming call" : "Active call");
  const collapsedCallMeta =
    contextName || (targetName && targetNumber ? targetNumber : "Softphone");
  const collapsedCallTime =
    status === "in-call" ? formatDuration(duration) : statusLabel;
  const endCallLabel = isIncoming ? "Reject" : "Hang up";
  const collapsedAccentClass =
    status === "incoming"
      ? "bg-success-500"
      : status === "dialing"
        ? "bg-brand-500"
        : status === "error"
          ? "bg-error-500"
          : "bg-success-500";
  const collapsedIconClass =
    status === "incoming"
      ? "bg-success-50 text-success-700 ring-success-500/20 dark:bg-success-900/20 dark:text-success-300"
      : "bg-brand-50 text-brand-700 ring-brand-500/20 dark:bg-brand-900/20 dark:text-brand-300";
  const useDraggedPosition = Boolean(position);
  const activePanelClassName = hasPanel
    ? "sm:rounded-l-none sm:shadow-none"
    : "";
  const shellClassName = [
    "flex h-[min(calc(100vh-2rem),600px)] w-[calc(100vw-2rem)] max-w-[360px] flex-col overflow-hidden rounded-lg border bg-white shadow-[0_34px_100px_rgba(15,23,42,0.38)] dark:bg-gray-900 dark:shadow-[0_34px_100px_rgba(0,0,0,0.7)] sm:h-full",
    activePanelClassName,
    isIncoming && !hasPanel
      ? "border-success-300 ring-4 ring-success-500/15 dark:border-success-700 dark:ring-success-500/20"
      : "border-gray-200 dark:border-gray-800",
  ].join(" ");
  const iconShellClassName = [
    "relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full",
    isIncoming
      ? hasPanel
        ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
        : "bg-success-600 text-white shadow-[0_18px_45px_rgba(3,152,85,0.38)]"
      : isEnded
        ? "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300"
      : "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300",
  ].join(" ");
  const shellPositionStyle =
    position && useDraggedPosition ? { left: position.x, top: position.y } : undefined;
  const shellRootClassName = [
    "fixed z-99999",
    useDraggedPosition
      ? ""
      : isStandaloneMode
        ? "right-4 bottom-4"
        : "right-4 bottom-4 sm:right-6 sm:bottom-6",
  ].join(" ");

  useEffect(() => {
    if (!isStandaloneMode) {
      return;
    }

    const hasActiveCall =
      hasCallInProgress ||
      status === "incoming" ||
      status === "dialing" ||
      status === "in-call";

    window.id30DesktopSoftphone?.setLayout?.({
      isOpen,
      hasPanel,
      showCollapsedCallControls,
      hasActiveCall,
    });
    window.dispatchEvent(
      new CustomEvent("id30:softphone-desktop-layout", {
        detail: {
          isOpen,
          hasPanel,
          showCollapsedCallControls,
          hasActiveCall,
        },
      }),
    );
  }, [
    hasCallInProgress,
    hasPanel,
    isOpen,
    isStandaloneMode,
    showCollapsedCallControls,
    status,
  ]);

  useEffect(() => {
    if (!isStandaloneMode || !window.id30DesktopSoftphone) {
      return;
    }

    let mounted = true;
    const desktopBridge = window.id30DesktopSoftphone;

    desktopBridge
      .getUpdateState?.()
      .then((state) => {
        if (mounted && state) {
          setDesktopUpdateState(state);
        }
      })
      .catch(() => {});

    const unsubscribe = desktopBridge.onUpdateState?.((state) => {
      setDesktopUpdateState(state);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [isStandaloneMode]);

  useEffect(() => {
    const state: SoftphoneExtensionPageState = {
      status,
      statusLabel,
      availability,
      targetName,
      targetNumber,
      contextName,
      hasCallInProgress,
      isMuted,
      isOnHold,
      duration,
      canAnswer: status === "incoming",
      canHangUp: canCancelCall,
      updatedAt: new Date().toISOString(),
    };

    postExtensionBridgeMessage("SOFTPHONE_STATE", state);
    window.dispatchEvent(
      new CustomEvent("id30:softphone-state", {
        detail: state,
      }),
    );
  }, [
    availability,
    canCancelCall,
    contextName,
    duration,
    hasCallInProgress,
    isMuted,
    isOnHold,
    postExtensionBridgeMessage,
    status,
    statusLabel,
    targetName,
    targetNumber,
  ]);

  return (
    <>
      {children}
      {!desktopSoftphoneActive && (
        <div
          ref={shellRef}
          className={shellRootClassName}
          style={shellPositionStyle}
        >
        {isOpen ? (
          <div
            className={`flex max-w-[calc(100vw-2rem)] flex-col-reverse items-stretch gap-2 ${
              isStandaloneMode
                ? "sm:h-[min(calc(100vh-2rem),600px)]"
                : "sm:h-[min(calc(100vh-6rem),600px)]"
            } sm:flex-row sm:items-stretch ${
              hasPanel
                ? "sm:gap-0 sm:rounded-lg sm:shadow-[0_34px_100px_rgba(15,23,42,0.38)] dark:sm:shadow-[0_34px_100px_rgba(0,0,0,0.7)]"
                : "sm:items-end"
            } ${useDraggedPosition && hasPanel ? "sm:relative sm:w-[360px]" : ""}`}
          >
          {hasPanel && (
            <div
              ref={sidePanelRef}
              className={`flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[360px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)] transition-colors duration-200 ease-out dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:h-full sm:w-[320px] sm:rounded-r-none sm:border-r-0 sm:shadow-none dark:sm:shadow-none ${
                useDraggedPosition
                  ? "sm:absolute sm:top-0 sm:right-full"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div className="flex items-center gap-2 text-gray-800 dark:text-white/90">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                    {panelIcon}
                  </span>
                  <p className="text-sm font-semibold">{panelTitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePanel(null)}
                  aria-label="Collapse side panel"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>

              <div
                className={`min-h-0 flex-1 max-h-[58vh] overflow-y-auto sm:max-h-none ${
                  visiblePanel === "history" ? "p-3" : "p-4"
                }`}
              >
                {visiblePanel === "context" && (
                  <div className="space-y-4">
                    {isCallerContextLoading && !callerContext ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-sm font-medium text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                        Loading customer context...
                      </div>
                    ) : callerContext ? (
                      <>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
                          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                            {callerContext.matched ? "Customer" : "Unknown caller"}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                            {callerContext.displayName ||
                              targetName ||
                              targetNumber ||
                              "Unmatched phone call"}
                          </p>
                          <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                            {callerContext.companyName && (
                              <p className="truncate">{callerContext.companyName}</p>
                            )}
                            {callerContext.role && (
                              <p className="truncate">{callerContext.role}</p>
                            )}
                            {(callerContext.phone || targetNumber) && (
                              <p className="truncate">
                                {callerContext.phone || targetNumber}
                              </p>
                            )}
                            {callerContext.email && (
                              <p className="truncate">{callerContext.email}</p>
                            )}
                            {!callerContext.contactId &&
                              !callerContext.opportunityId && (
                                <p className="text-amber-600 dark:text-amber-300">
                                  No CRM record matched this number.
                                </p>
                              )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {callerContext.contactProfileHref && (
                            <Link
                              href={callerContext.contactProfileHref}
                              className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-theme-xs hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                            >
                              <span className="truncate">Customer profile</span>
                              <ExternalLinkIcon className="h-4 w-4 shrink-0" />
                            </Link>
                          )}
                          {callerContext.saleProfileHref && (
                            <Link
                              href={callerContext.saleProfileHref}
                              className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-theme-xs hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                            >
                              <span className="truncate">Sale workspace</span>
                              <ExternalLinkIcon className="h-4 w-4 shrink-0" />
                            </Link>
                          )}
                        </div>

                        {canGenerateLeadFromCall && (
                          <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 dark:border-brand-900/50 dark:bg-brand-900/10">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-theme-xs dark:bg-gray-900 dark:text-brand-300">
                                <NoteIcon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  Create a lead from this call
                                </p>
                                <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                                  Link this call to a new sale so products and
                                  discovery can be completed.
                                </p>
                              </div>
                            </div>
                            {generateLeadError && (
                              <p className="mt-3 rounded-md bg-error-50 px-3 py-2 text-xs font-medium text-error-700 dark:bg-error-500/10 dark:text-error-300">
                                {generateLeadError}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={generateLeadFromCall}
                              disabled={isGeneratingLead}
                              className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <NoteIcon className="h-4 w-4" />
                              {isGeneratingLead ? "Generating..." : "Generate lead"}
                            </button>
                          </div>
                        )}

                        {callerContext.saleSummary && (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                  Sale recap
                                </p>
                                <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                                  {callerContext.saleSummary.title}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                                {formatStageLabel(callerContext.saleSummary.stage)}
                              </span>
                            </div>

                            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-md bg-white px-2 py-2 dark:bg-gray-900">
                                <dt className="text-gray-500 dark:text-gray-400">
                                  Value
                                </dt>
                                <dd className="mt-0.5 truncate font-semibold text-gray-800 dark:text-white/90">
                                  {formatContextMoney(
                                    callerContext.saleSummary.valueCents,
                                    callerContext.saleSummary.currency,
                                  )}
                                </dd>
                              </div>
                              <div className="rounded-md bg-white px-2 py-2 dark:bg-gray-900">
                                <dt className="text-gray-500 dark:text-gray-400">
                                  Chance
                                </dt>
                                <dd className="mt-0.5 font-semibold text-gray-800 dark:text-white/90">
                                  {callerContext.saleSummary.probability}%
                                </dd>
                              </div>
                              <div className="rounded-md bg-white px-2 py-2 dark:bg-gray-900">
                                <dt className="text-gray-500 dark:text-gray-400">
                                  Close
                                </dt>
                                <dd className="mt-0.5 truncate font-semibold text-gray-800 dark:text-white/90">
                                  {formatContextDate(
                                    callerContext.saleSummary.expectedCloseDate,
                                  )}
                                </dd>
                              </div>
                              <div className="rounded-md bg-white px-2 py-2 dark:bg-gray-900">
                                <dt className="text-gray-500 dark:text-gray-400">
                                  Owner
                                </dt>
                                <dd className="mt-0.5 truncate font-semibold text-gray-800 dark:text-white/90">
                                  {callerContext.saleSummary.ownerName ||
                                    "Unassigned"}
                                </dd>
                              </div>
                            </dl>

                            {callerContext.saleSummary.nextStep && (
                              <div className="mt-3 rounded-md bg-white px-3 py-2 dark:bg-gray-900">
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                  Next step
                                </p>
                                <p className="mt-1 text-xs leading-5 text-gray-700 dark:text-gray-300">
                                  {callerContext.saleSummary.nextStep}
                                </p>
                              </div>
                            )}

                            {callerContext.saleSummary.latestActivity && (
                              <div className="mt-3 rounded-md bg-white px-3 py-2 dark:bg-gray-900">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                    Latest activity
                                  </p>
                                  <span className="shrink-0 text-[11px] text-gray-400">
                                    {formatPanelDateTime(
                                      callerContext.saleSummary.latestActivity
                                        .occurredAt,
                                    )}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-gray-700 dark:text-gray-300">
                                  {callerContext.saleSummary.latestActivity.summary}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}

                {visiblePanel === "dial" && (
                  <div className="space-y-4">
                    <label htmlFor="softphone-panel-number" className="sr-only">
                      Number
                    </label>
                    <div className="flex h-12 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 shadow-theme-xs focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                      <KeypadIcon className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                      <input
                        id="softphone-panel-number"
                        type="tel"
                        value={targetNumber}
                        onChange={(event) => {
                          setTargetNumber(event.target.value);
                          setTargetName("");
                        }}
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-center text-base font-semibold tabular-nums text-gray-800 placeholder:text-gray-400 focus:outline-hidden dark:text-white/90"
                        placeholder="+447000000000"
                      />
                      {targetNumber && (
                        <button
                          type="button"
                          onClick={() => {
                            setTargetNumber("");
                            setTargetName("");
                          }}
                          aria-label="Clear number"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {keypadButtons.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTargetNumber((current) => `${current}${key}`)}
                          className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-semibold text-gray-800 shadow-theme-xs hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:hover:bg-white/[0.05]"
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTargetNumber((current) => current.slice(0, -1))}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => void startCall()}
                        disabled={!hasTarget || status === "connecting" || status === "dialing" || status === "in-call"}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-success-600 px-3 text-sm font-semibold text-white hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Call
                      </button>
                    </div>
                  </div>
                )}

                {visiblePanel === "contacts" && (
                  <div className="space-y-3">
                    <label htmlFor="softphone-contact-search" className="sr-only">
                      Search contacts
                    </label>
                    <input
                      id="softphone-contact-search"
                      type="search"
                      value={contactSearch}
                      onChange={(event) => {
                        setContactSearch(event.target.value);
                        setContactPage(1);
                      }}
                      className="dark:bg-dark-900 shadow-theme-xs h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                      placeholder="Search contacts"
                    />
                    {contactsError && (
                      <p className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs font-medium text-error-700 dark:border-error-900/40 dark:bg-error-900/10 dark:text-error-300">
                        {contactsError}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {visibleContacts.map((contact) => {
                        const contactPhone = contact.phone ?? "";

                        return (
                          <div
                            key={contact.id}
                            className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                                {contact.displayName}
                              </p>
                              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {contactPhone || "No phone number"}
                              </p>
                            </div>
                            <button
                              type="button"
                              aria-label={`Call ${contact.displayName}`}
                              onClick={() => {
                                if (!contactPhone) return;
                                setTargetNumber(contactPhone);
                                setTargetName(contact.displayName);
                                setContactId(contact.id);
                                setRenderedPanel("dial");
                                setActivePanel("dial");
                              }}
                              disabled={!contactPhone}
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                contactPhone
                                  ? "bg-success-600 text-white hover:bg-success-700"
                                  : "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.04] dark:text-gray-600"
                              }`}
                            >
                              <PhoneIcon className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                      {!filteredContacts.length && (
                        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                          No contacts found.
                        </p>
                      )}
                    </div>
                    {filteredContacts.length > softphoneContactsPageSize && (
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => setContactPage((page) => Math.max(1, page - 1))}
                          disabled={currentContactPage <= 1}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                        >
                          Prev
                        </button>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {currentContactPage} / {contactTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setContactPage((page) =>
                              Math.min(contactTotalPages, page + 1),
                            )
                          }
                          disabled={currentContactPage >= contactTotalPages}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {visiblePanel === "history" && (
                  <div className="space-y-1.5">
                    {historyError && (
                      <p className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs font-medium text-error-700 dark:border-error-900/40 dark:bg-error-900/10 dark:text-error-300">
                        {historyError}
                      </p>
                    )}
                    {isHistoryLoading && !callHistory.length && (
                      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        Loading call history...
                      </p>
                    )}
                    {visibleHistory.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.number === "Unknown number") {
                            return;
                          }

                          setTargetNumber(item.number);
                          setTargetName(item.name);
                          setRenderedPanel("dial");
                          setActivePanel("dial");
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-white dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                              {historyTitle(item)}
                            </span>
                            <span className="shrink-0 text-[11px] text-gray-400">
                              {formatPanelDateTime(item.timestamp)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                            {item.direction}
                            {historyTitle(item) !== item.number ? ` · ${item.number}` : ""}
                          </span>
                          <span className="mt-0.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                            {item.status}
                            {typeof item.durationSeconds === "number"
                              ? ` · ${formatDuration(item.durationSeconds)}`
                              : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                    {!isHistoryLoading && !callHistory.length && !historyError && (
                      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        Recent calls will appear here.
                      </p>
                    )}
                    {callHistory.length > softphoneHistoryPageSize && (
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                          disabled={currentHistoryPage <= 1}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                        >
                          Prev
                        </button>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {currentHistoryPage} / {historyTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryPage((page) =>
                              Math.min(historyTotalPages, page + 1),
                            )
                          }
                          disabled={currentHistoryPage >= historyTotalPages}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {visiblePanel === "transfer" && (
                  <div className="space-y-3">
                    {status !== "in-call" && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                        Call another available browser softphone without using a
                        mobile or landline.
                      </div>
                    )}
                    <label htmlFor="softphone-directory-search" className="sr-only">
                      Search staff
                    </label>
                    <input
                      id="softphone-directory-search"
                      type="search"
                      value={directorySearch}
                      onChange={(event) => {
                        setDirectorySearch(event.target.value);
                        setDirectoryPage(1);
                      }}
                      className="dark:bg-dark-900 shadow-theme-xs h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                      placeholder="Search staff"
                    />
                    <div className="space-y-2">
                      {visibleDirectory.map((user) => {
                        const transferDisabled =
                          status !== "in-call" ||
                          !user.canReceiveTransfer ||
                          isTransferring;
                        const internalCallDisabled =
                          user.id === currentUserId ||
                          !user.canReceiveInternalCall ||
                          hasCallInProgress ||
                          status === "connecting" ||
                          status === "incoming" ||
                          status === "dialing" ||
                          status === "in-call";

                        return (
                          <div
                            key={user.id}
                            className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]"
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 bg-cover bg-center text-xs font-semibold text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.08] dark:text-gray-300 dark:ring-white/10"
                                style={
                                  user.avatarUrl
                                    ? { backgroundImage: `url(${user.avatarUrl})` }
                                    : undefined
                                }
                              >
                                {user.avatarUrl ? (
                                  <span className="sr-only">{user.displayName}</span>
                                ) : (
                                  userInitials(user.displayName)
                                )}
                                <span
                                  className={`absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-gray-50 dark:border-gray-900 ${directoryAvailabilityDotClass(
                                    user.voiceAvailability,
                                  )}`}
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                                  {user.displayName}
                                </p>
                                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                  {user.voiceRoutingMode.toLowerCase()}
                                  {user.voiceExtension ? ` · ${user.voiceExtension}` : ""}
                                  {` · ${user.voiceAvailability.toLowerCase()}`}
                                </p>
                              </div>
                            </div>
                            {status === "in-call" ? (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => void startTransfer(user.id, "warm")}
                                  disabled={transferDisabled}
                                  className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05] dark:disabled:bg-white/[0.03] dark:disabled:text-gray-600"
                                >
                                  Warm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void startTransfer(user.id, "cold")}
                                  disabled={transferDisabled}
                                  className={`inline-flex h-8 items-center justify-center rounded-lg px-2 text-xs font-semibold ${
                                    transferDisabled
                                      ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.04] dark:text-gray-600"
                                      : "bg-brand-500 text-white hover:bg-brand-600"
                                  }`}
                                >
                                  Cold
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void startInternalCall(user)}
                                disabled={internalCallDisabled}
                                className={`mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg px-2 text-xs font-semibold ${
                                  internalCallDisabled
                                    ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.04] dark:text-gray-600"
                                    : "bg-success-600 text-white hover:bg-success-700"
                                }`}
                              >
                                <PhoneIcon className="h-3.5 w-3.5" />
                                {user.id === currentUserId
                                  ? "This is you"
                                  : user.canReceiveInternalCall
                                    ? "Call softphone"
                                    : "Softphone unavailable"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {!filteredDirectory.length && (
                        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                          No staff found.
                        </p>
                      )}
                    </div>
                    {filteredDirectory.length > softphoneDirectoryPageSize && (
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setDirectoryPage((page) => Math.max(1, page - 1))
                          }
                          disabled={currentDirectoryPage <= 1}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                        >
                          Prev
                        </button>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {currentDirectoryPage} / {directoryTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDirectoryPage((page) =>
                              Math.min(directoryTotalPages, page + 1),
                            )
                          }
                          disabled={currentDirectoryPage >= directoryTotalPages}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                        >
                          Next
                        </button>
                      </div>
                    )}
                    {transferMessage && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {transferMessage}
                      </p>
                    )}
                  </div>
                )}

                {visiblePanel === "settings" && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        Availability
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {availabilityOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              void setServerAvailability(option.value, {
                                manual: true,
                              })
                            }
                            className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold ${
                              availability === option.value
                                ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                                : "bg-transparent text-gray-500 hover:bg-white dark:text-gray-400 dark:hover:bg-white/[0.06]"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${option.dotClassName}`} />
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
                      <span>
                        <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
                          Inbound animation
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          Show the ringing pulse for incoming calls.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={softphoneSettings.inboundAnimation}
                        onChange={(event) =>
                          updateSoftphoneSetting("inboundAnimation", event.target.checked)
                        }
                        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
                      <span>
                        <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
                          Keep panel open
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          Leave the side panel open while moving around the CRM.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={softphoneSettings.keepPanelOpen}
                        onChange={(event) =>
                          updateSoftphoneSetting("keepPanelOpen", event.target.checked)
                        }
                        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                      />
                    </label>
                    {desktopUpdateState && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
                        <div className="flex items-start justify-between gap-3">
                          <span>
                            <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
                              Desktop app
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Version {desktopUpdateState.currentVersion}
                            </span>
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              desktopUpdateState.status === "error"
                                ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
                                : desktopUpdateState.status === "downloading" ||
                                    desktopUpdateState.status === "ready" ||
                                    desktopUpdateState.status === "installing"
                                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
                                  : "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                            }`}
                          >
                            {desktopUpdateState.status === "downloading"
                              ? "Updating"
                              : desktopUpdateState.status === "ready"
                                ? "Ready"
                                : desktopUpdateState.status === "installing"
                                  ? "Installing"
                                  : desktopUpdateState.status === "checking"
                                    ? "Checking"
                                    : desktopUpdateState.status === "error"
                                      ? "Error"
                                      : desktopUpdateState.status === "disabled"
                                        ? "Disabled"
                                        : "Current"}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                            {desktopUpdateState.message}
                          </p>
                          {desktopUpdateState.configured && (
                            <button
                              type="button"
                              onClick={() =>
                                void window.id30DesktopSoftphone?.checkForUpdates?.()
                              }
                              disabled={
                                desktopUpdateState.status === "checking" ||
                                desktopUpdateState.status === "downloading" ||
                                desktopUpdateState.status === "installing"
                              }
                              className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                            >
                              Check
                            </button>
                          )}
                        </div>
                        {desktopUpdateState.error && (
                          <p className="mt-2 text-xs text-error-600 dark:text-error-400">
                            {desktopUpdateState.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className={shellClassName} data-softphone-drag-target>
            <div
              className={`flex touch-none cursor-grab items-center justify-between px-4 py-3 active:cursor-grabbing ${
                isIncoming
                  ? "bg-success-50 dark:bg-success-950/30"
                  : ""
              }`}
              onMouseDown={isStandaloneMode ? undefined : startDrag}
              data-desktop-window-drag-handle={isStandaloneMode ? true : undefined}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-label="Drag softphone"
                  className="inline-flex h-8 w-5 shrink-0 items-center justify-center text-gray-400 dark:text-gray-500"
                >
                  <GripIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Softphone
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusPillClass}`}
                >
                  {headerStatusLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    closeSoftphoneWithMorph({
                      collapsePanels: !softphoneSettings.keepPanelOpen,
                    });
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  data-desktop-no-drag={isStandaloneMode ? true : undefined}
                  aria-label="Close softphone"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 rounded-lg bg-gray-100 p-1 dark:bg-white/[0.04]">
                <div className="grid grid-cols-4 gap-1">
                  {availabilityOptions.map((option) => {
                    const selected = availability === option.value;
                    const disabled = status === "in-call" || status === "dialing";

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          void setServerAvailability(option.value, {
                            manual: true,
                          })
                        }
                        disabled={disabled}
                        className={`inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-[10px] font-semibold transition sm:gap-1.5 sm:px-1.5 sm:text-[11px] disabled:cursor-not-allowed disabled:opacity-45 ${
                          selected
                            ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                            : "text-gray-500 hover:bg-white/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-200"
                        }`}
                        aria-pressed={selected}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${option.dotClassName}`}
                        />
                        <span className="truncate">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                className={`mb-4 grid gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] ${
                  callerContext ? "grid-cols-5" : "grid-cols-4"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActivePanel(null)}
                  className={`inline-flex h-10 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-semibold transition ${
                    !activePanel
                      ? "bg-gray-100 text-gray-900 dark:bg-white/[0.08] dark:text-white"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                  }`}
                >
                  <PhoneIcon className="h-4 w-4" />
                  Phone
                </button>
                {callerContext && (
                  <button
                    type="button"
                    onClick={() => openPanel("context")}
                    className={`inline-flex h-10 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-semibold transition ${
                      activePanel === "context"
                        ? "bg-gray-100 text-gray-900 dark:bg-white/[0.08] dark:text-white"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                    }`}
                  >
                    <NoteIcon className="h-4 w-4" />
                    Context
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openPanel("contacts")}
                  className={`inline-flex h-10 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-semibold transition ${
                    activePanel === "contacts"
                      ? "bg-gray-100 text-gray-900 dark:bg-white/[0.08] dark:text-white"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                  }`}
                >
                  <UsersIcon className="h-4 w-4" />
                  Contacts
                </button>
                <button
                  type="button"
                  onClick={() => openPanel("history")}
                  className={`inline-flex h-10 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-semibold transition ${
                    activePanel === "history"
                      ? "bg-gray-100 text-gray-900 dark:bg-white/[0.08] dark:text-white"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                  }`}
                >
                  <HistoryIcon className="h-4 w-4" />
                  History
                </button>
                <button
                  type="button"
                  onClick={() => openPanel("settings")}
                  className={`inline-flex h-10 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-semibold transition ${
                    activePanel === "settings"
                      ? "bg-gray-100 text-gray-900 dark:bg-white/[0.08] dark:text-white"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                  }`}
                >
                  <SettingsIcon className="h-4 w-4" />
                  Settings
                </button>
              </div>
              <div className="text-center">
                <div className={iconShellClassName}>
                  {showIncomingAnimation && (
                    <>
                      <span className="absolute inset-0 rounded-full bg-success-500/30 animate-ping" />
                      <span className="absolute inset-[-10px] rounded-full border border-success-300/70 animate-pulse dark:border-success-500/40" />
                    </>
                  )}
                  <PhoneIcon
                    className={`relative h-6 w-6 ${
                      showIncomingAnimation
                        ? "animate-pulse"
                        : ""
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  {isIncoming && (
                    <p className="mb-1 text-xs font-semibold uppercase text-success-700 dark:text-success-300">
                      Incoming call
                    </p>
                  )}
                  <p className="truncate text-base font-semibold text-gray-900 dark:text-white">
                    {isEnded
                      ? "Call ended"
                      : isIncoming
                      ? targetName || targetNumber || "Unknown caller"
                      : hasTarget
                        ? targetName || "Manual call"
                        : "No number selected"}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                    {isEnded
                      ? "Softphone will reset"
                      : isIncoming
                      ? targetName && targetNumber && targetName !== targetNumber
                        ? targetNumber
                        : "Ringing in browser"
                      : hasTarget
                        ? targetNumber
                        : "Ready for a new outbound call"}
                  </p>
                  {(isEnded || isIncoming || isCalling) && (
                    <span
                      className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        isIncoming
                          ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                          : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                      }`}
                    >
                      {isEnded
                        ? "Hung up"
                        : isIncoming
                          ? "Waiting for answer"
                          : "Calling via Twilio"}
                    </span>
                  )}
                  {contextName && (
                    <p className="mt-2 truncate text-xs font-medium text-brand-600 dark:text-brand-300">
                      {contextName}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => openPanel("dial")}
                className={`mx-auto mt-4 flex h-12 w-full max-w-[280px] items-center justify-between rounded-lg border px-2.5 text-left shadow-theme-xs transition ${
                  activePanel === "dial"
                    ? "border-brand-200 bg-brand-50 dark:border-brand-900/40 dark:bg-brand-900/20"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700 dark:hover:bg-white/[0.06]"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.08]">
                    <KeypadIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-gray-800 dark:text-white/90">
                      {hasTarget ? "Number" : "Manual dial"}
                    </span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {hasTarget ? targetNumber : "Open keypad"}
                    </span>
                  </span>
                </span>
                <span className="ml-3 shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.08]">
                  {hasTarget ? "Edit" : "Dial"}
                </span>
              </button>

              {(status === "dialing" ||
                status === "in-call" ||
                status === "connecting" ||
                status === "error" ||
                isEnded) && (
                <div className="py-6 text-center">
                  {(status === "dialing" || status === "in-call") && (
                    <p className="mt-5 text-3xl font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatDuration(duration)}
                    </p>
                  )}
                  <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                    {status === "ended" ? "Call hung up. Resetting..." : statusLabel}
                  </p>
                  {error && !hasSetupError && (
                    <p className="mt-3 text-xs leading-5 text-error-600 dark:text-error-400">
                      {error}
                    </p>
                  )}
                </div>
              )}

              {hasSetupError && (
                <div className="rounded-lg border border-warning-200 bg-warning-50 p-3 dark:border-warning-900/40 dark:bg-warning-900/10">
                  <div className="flex gap-3">
                    <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning-700 dark:text-warning-300" />
                    <div>
                      <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
                        Twilio setup required
                      </p>
                      <p className="mt-1 text-xs leading-5 text-warning-700 dark:text-warning-300">
                        {error}
                      </p>
                      <Link
                        href="/settings/integrations/twilio"
                        className="mt-2 inline-flex text-xs font-medium text-warning-800 underline underline-offset-2 dark:text-warning-200"
                      >
                        Open Twilio settings
                      </Link>
                    </div>
                  </div>
                </div>
              )}
              </div>

              <div className="mt-4 shrink-0 space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={toggleMute}
                    disabled={status !== "in-call"}
                    className={`inline-flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold shadow-theme-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                      isMuted
                        ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                    }`}
                    aria-label={isMuted ? "Unmute call" : "Mute call"}
                  >
                    {isMuted ? (
                      <MicOffIcon className="h-4 w-4" />
                    ) : (
                      <MicIcon className="h-4 w-4" />
                    )}
                    {isMuted ? "Muted" : "Mute"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleHold()}
                    disabled={status !== "in-call"}
                    className={`inline-flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold shadow-theme-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                      isOnHold
                        ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                    }`}
                    aria-label={isOnHold ? "Resume call" : "Hold call"}
                  >
                    <PauseIcon className="h-4 w-4" />
                    {isOnHold ? "Resume" : "Hold"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openPanel("transfer")}
                    className={`inline-flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold shadow-theme-xs ${
                      activePanel === "transfer"
                        ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                    }`}
                    aria-label={status === "in-call" ? "Transfer call" : "Open staff"}
                  >
                    <TransferIcon className="h-4 w-4" />
                    {status === "in-call" ? "Transfer" : "Staff"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openPanel("dial")}
                    className={`inline-flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold shadow-theme-xs ${
                      activePanel === "dial"
                        ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                    }`}
                    aria-label="Open keypad"
                  >
                    <KeypadIcon className="h-4 w-4" />
                    Keypad
                  </button>
                </div>
                <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    status === "incoming" ? answerIncoming() : void startCall()
                  }
                  disabled={
                    (status !== "incoming" && !hasTarget) ||
                    status === "connecting" ||
                    status === "dialing" ||
                    status === "in-call"
                  }
                  className={`inline-flex h-12 min-w-28 items-center justify-center gap-2 rounded-full bg-success-600 px-5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(22,163,74,0.35)] hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-50 ${
                    showIncomingAnimation ? "animate-pulse ring-4 ring-success-500/25" : ""
                  }`}
                  aria-label={status === "incoming" ? "Answer call" : "Start call"}
                >
                  <PhoneIcon className="h-5 w-5" />
                  {status === "incoming" ? "Answer" : "Call"}
                </button>
                <button
                  type="button"
                  onClick={hangUp}
                  disabled={!canCancelCall}
                  className="inline-flex h-12 min-w-28 items-center justify-center gap-2 rounded-full bg-error-600 px-5 text-sm font-semibold text-white shadow-theme-xs hover:bg-error-700 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={endCallLabel}
                >
                  <PhoneIcon className="h-5 w-5" />
                  {endCallLabel}
                </button>
                </div>

                {warmTransferActive && (
                  <button
                    type="button"
                    onClick={() => void completeWarmTransfer()}
                    className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    Leave customer with new agent
                  </button>
                )}
              </div>

            </div>
          </div>
          </div>
        ) : (
          <div className="flex items-end justify-end gap-3">
            {showCollapsedCallControls && (
              <div
                className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.24)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_18px_55px_rgba(0,0,0,0.55)]"
                data-softphone-drag-target
              >
                <div className={`h-1 ${collapsedAccentClass}`} />
                <div
                  className="flex touch-none cursor-grab items-center gap-3 px-3 py-3 active:cursor-grabbing"
                  onMouseDown={isStandaloneMode ? undefined : startDrag}
                  data-desktop-window-drag-handle={isStandaloneMode ? true : undefined}
                >
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ${collapsedIconClass}`}
                  >
                    <PhoneIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {collapsedCallTitle}
                      </p>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
                        {collapsedCallTime}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                      {collapsedCallMeta}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpenWithMorph(true);
                      setStatus((current) => (current === "closed" ? "idle" : current));
                    }}
                    data-desktop-no-drag={isStandaloneMode ? true : undefined}
                    className="inline-flex h-10 items-center justify-center gap-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                  >
                    <ChevronRightIcon className="h-3.5 w-3.5 rotate-180" />
                    Open
                  </button>
                  {status === "incoming" ? (
                    <button
                      type="button"
                      onClick={answerIncoming}
                      data-desktop-no-drag={isStandaloneMode ? true : undefined}
                      className="inline-flex h-10 items-center justify-center gap-1.5 border-l border-gray-100 text-xs font-semibold text-success-700 hover:bg-success-50 dark:border-gray-800 dark:text-success-300 dark:hover:bg-success-900/20"
                    >
                      <PhoneIcon className="h-3.5 w-3.5" />
                      Answer
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={toggleMute}
                      disabled={status !== "in-call"}
                      data-desktop-no-drag={isStandaloneMode ? true : undefined}
                      className="inline-flex h-10 items-center justify-center gap-1.5 border-l border-gray-100 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                    >
                      {isMuted ? (
                        <MicOffIcon className="h-3.5 w-3.5" />
                      ) : (
                        <MicIcon className="h-3.5 w-3.5" />
                      )}
                      {isMuted ? "Muted" : "Mute"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void hangUp()}
                    data-desktop-no-drag={isStandaloneMode ? true : undefined}
                    className="inline-flex h-10 items-center justify-center gap-1.5 border-l border-gray-100 text-xs font-semibold text-error-600 hover:bg-error-50 dark:border-gray-800 dark:text-error-300 dark:hover:bg-error-900/20"
                  >
                    <PhoneIcon className="h-3.5 w-3.5 rotate-[135deg]" />
                    {endCallLabel}
                  </button>
                </div>
              </div>
            )}
            {!showCollapsedCallControls && (
              <div
                className="flex h-16 w-16 items-center justify-center"
                data-desktop-window-drag-handle={isStandaloneMode ? true : undefined}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsOpenWithMorph(true);
                    setStatus((current) =>
                      current === "closed" ? "idle" : current,
                    );
                  }}
                  data-desktop-no-drag={isStandaloneMode ? true : undefined}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white shadow-lg transition hover:bg-brand-600"
                  aria-label="Open softphone"
                >
                  <PhoneIcon className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      )}
    </>
  );
}
