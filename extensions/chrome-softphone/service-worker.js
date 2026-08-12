const CRM_ORIGIN = "https://crm.id30.com";
const SOFTPHONE_WINDOW_URL = `${CRM_ORIGIN}/softphone-window`;
const CRM_URL_PATTERNS = [`${CRM_ORIGIN}/*`];
const RINGING_NOTIFICATION_ID = "id30-softphone-ringing";

async function setStoredState(state) {
  await chrome.storage.session.set({ softphoneState: state });
}

async function getStoredState() {
  const { softphoneState } = await chrome.storage.session.get("softphoneState");
  return softphoneState || null;
}

function badgeForStatus(status) {
  if (status === "incoming") {
    return { text: "CALL", color: "#16a34a" };
  }

  if (status === "in-call" || status === "dialing") {
    return { text: "ON", color: "#2563eb" };
  }

  if (status === "error") {
    return { text: "ERR", color: "#dc2626" };
  }

  return { text: "", color: "#6b7280" };
}

async function updateActionBadge(state) {
  const badge = badgeForStatus(state?.status);
  await chrome.action.setBadgeText({ text: badge.text });
  await chrome.action.setBadgeBackgroundColor({ color: badge.color });
}

async function notifyIfRinging(state) {
  if (state?.status !== "incoming") {
    await chrome.notifications.clear(RINGING_NOTIFICATION_ID);
    return;
  }

  await chrome.notifications.create(RINGING_NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Incoming call",
    message: state.targetName || state.targetNumber || "Incoming CRM call",
    priority: 2,
    requireInteraction: true,
  });
}

async function findCrmTab() {
  for (const url of CRM_URL_PATTERNS) {
    const tabs = await chrome.tabs.query({ url });
    const activeTab = tabs.find((tab) => tab.active);

    if (activeTab?.id) {
      return activeTab;
    }

    if (tabs[0]?.id) {
      return tabs[0];
    }
  }

  return null;
}

async function findSoftphoneWindowTab() {
  const tabs = await chrome.tabs.query({ url: `${SOFTPHONE_WINDOW_URL}*` });
  return tabs.find((tab) => tab.id && tab.windowId) || null;
}

async function focusSoftphoneWindow(tab) {
  if (!tab?.id || !tab.windowId) {
    return false;
  }

  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return true;
}

async function openSoftphoneWindow() {
  const softphoneTab = await findSoftphoneWindowTab();

  if (await focusSoftphoneWindow(softphoneTab)) {
    return softphoneTab;
  }

  const createdWindow = await chrome.windows.create({
    url: SOFTPHONE_WINDOW_URL,
    type: "popup",
    width: 760,
    height: 720,
    focused: true,
  });

  return createdWindow?.tabs?.[0] || null;
}

async function sendCommand(action) {
  const tab = (await findSoftphoneWindowTab()) || (await findCrmTab());

  if (!tab?.id) {
    await openSoftphoneWindow();
    return;
  }

  await chrome.tabs.sendMessage(tab.id, {
    type: "SOFTPHONE_COMMAND",
    action,
  });
}

chrome.action.onClicked.addListener(async () => {
  const tab = await openSoftphoneWindow();

  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, {
      type: "SOFTPHONE_COMMAND",
      action: "open",
    }).catch(() => {});
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== RINGING_NOTIFICATION_ID) {
    return;
  }

  const tab = (await findSoftphoneWindowTab()) || (await findCrmTab());

  if (tab?.id && tab.windowId) {
    await focusSoftphoneWindow(tab);
    await sendCommand("open");
  } else {
    await openSoftphoneWindow();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CRM_SOFTPHONE_STATE") {
    const state = message.payload;
    setStoredState(state)
      .then(() => updateActionBadge(state))
      .then(() => notifyIfRinging(state))
      .then(() => {
        chrome.runtime.sendMessage({
          type: "SOFTPHONE_STATE_UPDATED",
          payload: state,
        }).catch(() => {});
      });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "GET_SOFTPHONE_STATE") {
    getStoredState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "SOFTPHONE_COMMAND_REQUEST") {
    sendCommand(message.action)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
