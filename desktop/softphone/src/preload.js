const { contextBridge, ipcRenderer } = require("electron");

let lastLayoutSignature = "";
let inferredLayoutTimer = null;
let latestDialPayload = null;

function sendSoftphoneCommand(action) {
  window.postMessage(
    {
      source: "id30-crm-extension",
      type: "SOFTPHONE_COMMAND",
      payload: { action },
    },
    window.location.origin,
  );
}

function sendSoftphoneDial(payload) {
  const detail = {
    requestId: payload?.requestId,
    phone: payload?.phone,
    contactName: payload?.contactName,
    contextName: payload?.contextName,
    opportunityId: payload?.opportunityId,
    contactId: payload?.contactId,
  };

  window.dispatchEvent(
    new CustomEvent("crm-softphone:dial", {
      detail,
    }),
  );
  window.postMessage(
    {
      source: "id30-crm-extension",
      type: "SOFTPHONE_COMMAND",
      payload: {
        action: "dial",
        ...detail,
      },
    },
    window.location.origin,
  );
}

function deliverDialCommand(payload) {
  latestDialPayload = payload;
  sendSoftphoneDial(payload);
  window.setTimeout(() => sendSoftphoneDial(payload), 750);
  window.setTimeout(() => {
    if (latestDialPayload?.requestId === payload?.requestId) {
      sendSoftphoneDial(payload);
    }
  }, 2000);
}

function injectDesktopStyles() {
  if (document.getElementById("id30-desktop-softphone-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "id30-desktop-softphone-style";
  style.textContent = `
    html,
    body {
      background: transparent !important;
      overflow: hidden !important;
    }

    .id30-desktop-softphone-root {
      bottom: 16px !important;
      left: auto !important;
      right: 16px !important;
      top: auto !important;
      filter: drop-shadow(0 26px 58px rgba(15, 23, 42, 0.22));
      transform: none !important;
    }

    .id30-desktop-phone-surface,
    .id30-desktop-side-panel {
      border-color: rgba(203, 213, 225, 0.46) !important;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.72) inset,
        0 18px 44px rgba(15, 23, 42, 0.12) !important;
    }

    .id30-desktop-softphone-root.id30-desktop-has-panel
      .id30-desktop-phone-surface,
    .id30-desktop-softphone-root.id30-desktop-has-panel
      .id30-desktop-side-panel {
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.72) inset !important;
    }

    .id30-desktop-drag-region,
    [data-desktop-window-drag-handle] {
      -webkit-app-region: drag !important;
      cursor: grab !important;
      user-select: none !important;
    }

    .id30-desktop-drag-region:active,
    [data-desktop-window-drag-handle]:active {
      cursor: grabbing !important;
    }

    a,
    button,
    input,
    select,
    textarea,
    [role="button"],
    .id30-desktop-no-drag {
      -webkit-app-region: no-drag !important;
    }
  `;
  document.documentElement.appendChild(style);
}

function findPanelElement(collapseButton) {
  let element = collapseButton?.parentElement;

  while (element && element !== document.documentElement) {
    const className = element.getAttribute("class") ?? "";

    if (className.includes("overflow-hidden") && className.includes("max-h")) {
      return element;
    }

    element = element.parentElement;
  }

  return null;
}

function markDesktopRegions() {
  const softphoneSurface = document.querySelector("[data-softphone-drag-target]");
  const root = softphoneSurface?.closest(".fixed");
  const collapseButton = document.querySelector('[aria-label="Collapse side panel"]');
  const sidePanel = findPanelElement(collapseButton);

  if (root) {
    root.classList.add("id30-desktop-softphone-root");
    root.classList.toggle("id30-desktop-has-panel", Boolean(sidePanel));
  }

  softphoneSurface?.classList.add("id30-desktop-phone-surface");
  sidePanel?.classList.add("id30-desktop-side-panel");

  document.querySelectorAll('[aria-label="Drag softphone"]').forEach((element) => {
    const header = element.closest("div")?.parentElement;
    header?.classList.add("id30-desktop-drag-region");
  });

  document.querySelectorAll("button, a, input, select, textarea, [role='button']").forEach(
    (element) => {
      element.classList.add("id30-desktop-no-drag");
    },
  );
}

function sendInferredLayout() {
  window.clearTimeout(inferredLayoutTimer);

  inferredLayoutTimer = window.setTimeout(() => {
    const isOpen = Boolean(document.querySelector('[aria-label="Close softphone"]'));
    const hasPanel = Boolean(document.querySelector('[aria-label="Collapse side panel"]'));

    if (!isOpen) {
      return;
    }

    sendLayout({
      isOpen: true,
      hasPanel,
      showCollapsedCallControls: false,
    });
  }, 120);
}

function sendLayout(layout, force = false) {
  const signature = JSON.stringify(layout);

  if (!force && signature === lastLayoutSignature) {
    return;
  }

  lastLayoutSignature = signature;
  ipcRenderer.send("desktop-softphone:layout", layout);
}

function syncDesktopChrome() {
  injectDesktopStyles();
  markDesktopRegions();
  sendInferredLayout();
}

ipcRenderer.on("desktop-softphone:command", (_event, payload) => {
  if (payload?.action) {
    sendSoftphoneCommand(payload.action);
  }
});

ipcRenderer.on("desktop-softphone:dial", (_event, payload) => {
  deliverDialCommand(payload);
});

window.addEventListener("id30:softphone-desktop-layout", (event) => {
  sendLayout(event.detail, true);
});

window.addEventListener("id30:softphone-page-ready", () => {
  if (latestDialPayload) {
    sendSoftphoneDial(latestDialPayload);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  syncDesktopChrome();

  const observer = new MutationObserver(() => {
    syncDesktopChrome();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
});

contextBridge.exposeInMainWorld("id30DesktopSoftphone", {
  setCompactMode: (compactMode) =>
    ipcRenderer.invoke("desktop-softphone:set-compact", compactMode),
  setAlwaysOnTop: (alwaysOnTop) =>
    ipcRenderer.invoke("desktop-softphone:set-always-on-top", alwaysOnTop),
  getUpdateState: () => ipcRenderer.invoke("desktop-softphone:get-update-state"),
  checkForUpdates: () => ipcRenderer.invoke("desktop-softphone:check-for-updates"),
  onUpdateState: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, state) => callback(state);
    ipcRenderer.on("desktop-softphone:update-state", listener);

    return () => ipcRenderer.removeListener("desktop-softphone:update-state", listener);
  },
  setLayout: (layout) => {
    sendLayout(layout, true);
  },
});
