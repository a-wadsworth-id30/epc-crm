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

function dispatchLocalSoftphoneDial(detail: SoftphoneDialDetail) {
  window.dispatchEvent(
    new CustomEvent("crm-softphone:dial", {
      detail,
    }),
  );
}

async function fetchDesktopSoftphoneActive() {
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

async function queueDesktopSoftphoneDial(detail: SoftphoneDialDetail) {
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
  if (window.__id30DesktopSoftphoneActive) {
    launchDesktopSoftphoneDial(detail);
    return;
  }

  const desktopActive = await fetchDesktopSoftphoneActive();

  if (desktopActive) {
    const queued = await queueDesktopSoftphoneDial(detail).catch(() => false);

    if (queued) {
      return;
    }
  }

  dispatchLocalSoftphoneDial(detail);
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
