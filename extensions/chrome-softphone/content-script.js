const EXTENSION_SOURCE = "id30-crm-extension";
const PAGE_SOURCE = "id30-crm-page";
const VERSION = chrome.runtime.getManifest().version;
const capabilities = {
  softphoneUi: false,
  commandBridge: true,
  floatingOverlay: true,
};

function pagePayload(type, payload = {}) {
  return {
    source: EXTENSION_SOURCE,
    type,
    payload: {
      version: VERSION,
      capabilities,
      ...payload,
    },
  };
}

function announceReady(type = "READY") {
  const message = pagePayload(type);
  window.postMessage(message, window.location.origin);
  window.dispatchEvent(
    new CustomEvent("id30:softphone-extension-ready", {
      detail: message.payload,
    }),
  );
}

function sendCommandToPage(action) {
  window.postMessage(
    {
      source: EXTENSION_SOURCE,
      type: "SOFTPHONE_COMMAND",
      payload: { action },
    },
    window.location.origin,
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  const data = event.data || {};

  if (data.source !== PAGE_SOURCE) {
    return;
  }

  if (data.type === "PAGE_READY") {
    announceReady("READY");
    return;
  }

  if (data.type === "SOFTPHONE_STATE") {
    chrome.runtime
      .sendMessage({
        type: "CRM_SOFTPHONE_STATE",
        payload: data.payload,
      })
      .catch(() => {});
    return;
  }

  if (data.type === "OPEN_EXTENSION_PANEL") {
    sendCommandToPage("open");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SOFTPHONE_COMMAND") {
    sendCommandToPage(message.action);
  }
});

announceReady();
setInterval(() => announceReady("HEARTBEAT"), 4000);
