"use client";

export type SoftphoneDialDetail = {
  requestId?: string;
  phone: string;
  contactName?: string;
  contextName?: string;
  opportunityId?: string;
  contactId?: string;
};

export type SoftphoneDialEvent = CustomEvent<SoftphoneDialDetail>;

declare global {
  interface WindowEventMap {
    "crm-softphone:dial": SoftphoneDialEvent;
  }

  interface Window {
    __id30DesktopSoftphoneActive?: boolean;
  }
}

const desktopBridgeBaseUrl = "http://127.0.0.1:47730";

function dispatchLocalSoftphoneDial(detail: SoftphoneDialDetail) {
  window.dispatchEvent(
    new CustomEvent("crm-softphone:dial", {
      detail,
    }),
  );
}

function requestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 700,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeout));
}

export async function fetchLocalDesktopSoftphoneActive() {
  try {
    const response = await fetchWithTimeout(`${desktopBridgeBaseUrl}/status`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    window.__id30DesktopSoftphoneActive = true;

    return true;
  } catch {
    return false;
  }
}

async function fetchServerDesktopSoftphoneActive() {
  try {
    const response = await fetch("/api/telephony/desktop-presence", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json().catch(() => null)) as {
      active?: boolean;
    } | null;
    const active = Boolean(payload?.active);

    window.__id30DesktopSoftphoneActive = active;

    return active;
  } catch {
    return false;
  }
}

async function sendLocalDesktopSoftphoneDial(detail: SoftphoneDialDetail) {
  try {
    const response = await fetchWithTimeout(`${desktopBridgeBaseUrl}/dial`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(detail),
    });

    if (response.ok) {
      window.__id30DesktopSoftphoneActive = true;
      return true;
    }
  } catch {
    // Fall back to the registered desktop protocol.
  }

  return false;
}

async function queueLegacyDesktopSoftphoneDial(detail: SoftphoneDialDetail) {
  const response = await fetch("/api/telephony/desktop-command", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ type: "dial", payload: detail }),
  });

  return response.ok;
}

function desktopSoftphoneDialUrl(detail: SoftphoneDialDetail) {
  const params = new URLSearchParams();

  params.set("phone", detail.phone);
  params.set("requestId", detail.requestId ?? requestId());

  if (detail.contactName) params.set("contactName", detail.contactName);
  if (detail.contextName) params.set("contextName", detail.contextName);
  if (detail.opportunityId) params.set("opportunityId", detail.opportunityId);
  if (detail.contactId) params.set("contactId", detail.contactId);

  return `id30-softphone://dial?${params.toString()}`;
}

function launchDesktopSoftphoneDial(detail: SoftphoneDialDetail) {
  const link = document.createElement("a");

  link.href = desktopSoftphoneDialUrl(detail);
  link.rel = "noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => link.remove(), 1000);
}

async function routeSoftphoneDial(detail: SoftphoneDialDetail) {
  const command = {
    ...detail,
    requestId: detail.requestId ?? requestId(),
  };

  if (await sendLocalDesktopSoftphoneDial(command)) {
    return;
  }

  if (window.__id30DesktopSoftphoneActive) {
    launchDesktopSoftphoneDial(command);
    return;
  }

  const desktopActive = await fetchLocalDesktopSoftphoneActive();

  if (desktopActive) {
    launchDesktopSoftphoneDial(command);
    return;
  }

  const serverDesktopActive = await fetchServerDesktopSoftphoneActive();

  if (serverDesktopActive) {
    launchDesktopSoftphoneDial(command);
    void queueLegacyDesktopSoftphoneDial(command).catch(() => false);
    return;
  }

  dispatchLocalSoftphoneDial(command);
}

export function triggerSoftphoneDial(
  phone: string,
  contactName?: string,
  context?: {
    contextName?: string;
    opportunityId?: string;
    contactId?: string;
  },
) {
  if (typeof window === "undefined") {
    return;
  }

  void routeSoftphoneDial({ phone, contactName, ...context });
}
