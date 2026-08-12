const path = require("node:path");
const { execFile } = require("node:child_process");
const {
  app,
  autoUpdater,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  screen,
  session,
  shell,
  systemPreferences,
} = require("electron");
const { UpdateSourceType } = require("update-electron-app");
const releaseConfig = require("./release-config.json");

if (require("electron-squirrel-startup")) {
  app.quit();
}

const protocolScheme = "id30-softphone";
const softphoneUrl = process.env.ID30_SOFTPHONE_URL || "https://crm.id30.com/softphone-window";
const softphoneOrigin = new URL(softphoneUrl).origin;
const appWindowPaths = new Set(["/", "/signin", "/softphone-window"]);
const updateRepo = process.env.ID30_UPDATE_REPO || releaseConfig.updateRepo || "";
const updateBaseUrl =
  process.env.ID30_UPDATE_BASE_URL || releaseConfig.updateBaseUrl || "";
const windowSizes = {
  open: { width: 392, height: 632 },
  panel: { width: 712, height: 632 },
  collapsedCall: { width: 384, height: 144 },
  trigger: { width: 96, height: 96 },
};

let mainWindow = null;
let tray = null;
let compactMode = false;
let alwaysOnTop = true;
let pendingDialCommands = [];
let updateFeedConfigured = false;
let updateCheckTimer = null;
let hasActiveCall = false;
let pendingAutoInstall = false;
let updateState = {
  configured: false,
  currentVersion: app.getVersion(),
  latestVersion: null,
  status: "idle",
  message: "Updates are not configured.",
  error: null,
  checkedAt: null,
  downloadedAt: null,
  installMode: "automatic",
};
let lastLayout = {
  isOpen: true,
  hasPanel: false,
  showCollapsedCallControls: false,
};

function assetPath(...segments) {
  return path.join(__dirname, "..", ...segments);
}

function getIcon() {
  const icon = nativeImage.createFromPath(assetPath("assets", "icon-128.png"));

  return icon.isEmpty() ? undefined : icon;
}

function sendWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("desktop-softphone:state", {
    alwaysOnTop,
    compactMode,
  });
}

function publishUpdateState(nextState = {}) {
  updateState = {
    ...updateState,
    ...nextState,
    currentVersion: app.getVersion(),
    configured: updateFeedConfigured,
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop-softphone:update-state", updateState);
  }

  buildApplicationMenu();
  updateTrayMenu();
}

function maybeAutoInstallUpdate() {
  if (updateState.status !== "ready") {
    return;
  }

  if (hasActiveCall) {
    pendingAutoInstall = true;
    publishUpdateState({
      message: "Update downloaded. It will install automatically when this call ends.",
    });
    return;
  }

  pendingAutoInstall = false;
  publishUpdateState({
    status: "installing",
    message: "Installing update...",
  });

  setTimeout(() => {
    autoUpdater.quitAndInstall();
  }, 1500);
}

function sendSoftphoneCommand(action) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("desktop-softphone:command", { action });
}

function sendDialCommand(payload) {
  const dialPayload = {
    ...payload,
    requestId:
      payload?.requestId ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingDialCommands.push(dialPayload);
    return;
  }

  resizeWindowForLayout({
    isOpen: true,
    hasPanel: false,
    showCollapsedCallControls: false,
  });
  mainWindow.webContents.send("desktop-softphone:dial", dialPayload);
}

function flushPendingDialCommands() {
  if (!pendingDialCommands.length) {
    return;
  }

  const commands = pendingDialCommands;
  pendingDialCommands = [];
  commands.forEach((command) => sendDialCommand(command));
}

function getWindowSizeForLayout(layout) {
  if (!layout.isOpen) {
    return layout.showCollapsedCallControls
      ? windowSizes.collapsedCall
      : windowSizes.trigger;
  }

  return layout.hasPanel ? windowSizes.panel : windowSizes.open;
}

function getDesktopWorkArea() {
  const displays = screen.getAllDisplays();
  const minX = Math.min(...displays.map((display) => display.workArea.x));
  const minY = Math.min(...displays.map((display) => display.workArea.y));
  const maxX = Math.max(
    ...displays.map((display) => display.workArea.x + display.workArea.width),
  );
  const maxY = Math.max(
    ...displays.map((display) => display.workArea.y + display.workArea.height),
  );

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function resizeWindowForLayout(layout, animate = false) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  lastLayout = {
    ...lastLayout,
    ...layout,
  };

  const nextSize = getWindowSizeForLayout(lastLayout);
  const currentBounds = mainWindow.getBounds();
  const displayWorkArea = getDesktopWorkArea();
  const rightEdge = currentBounds.x + currentBounds.width;
  const bottomEdge = currentBounds.y + currentBounds.height;
  const maxX = Math.max(
    displayWorkArea.x,
    displayWorkArea.x + displayWorkArea.width - nextSize.width,
  );
  const maxY = Math.max(
    displayWorkArea.y,
    displayWorkArea.y + displayWorkArea.height - nextSize.height,
  );
  const nextX = Math.min(
    Math.max(rightEdge - nextSize.width, displayWorkArea.x),
    maxX,
  );
  const nextY = Math.min(
    Math.max(bottomEdge - nextSize.height, displayWorkArea.y),
    maxY,
  );

  mainWindow.setBounds(
    {
      x: nextX,
      y: nextY,
      width: nextSize.width,
      height: nextSize.height,
    },
    animate,
  );
}

function moveWindowBy(deltaX, deltaY) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const currentBounds = mainWindow.getBounds();
  const displayWorkArea = getDesktopWorkArea();
  const minX = displayWorkArea.x;
  const minY = displayWorkArea.y;
  const maxX = Math.max(
    minX,
    displayWorkArea.x + displayWorkArea.width - currentBounds.width,
  );
  const maxY = Math.max(
    minY,
    displayWorkArea.y + displayWorkArea.height - currentBounds.height,
  );
  const nextX = Math.min(Math.max(currentBounds.x + deltaX, minX), maxX);
  const nextY = Math.min(Math.max(currentBounds.y + deltaY, minY), maxY);

  mainWindow.setBounds(
    {
      ...currentBounds,
      x: nextX,
      y: nextY,
    },
    false,
  );
}

function setCompactMode(nextCompactMode) {
  compactMode = Boolean(nextCompactMode);

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (compactMode) {
    sendSoftphoneCommand("close");
  } else {
    resizeWindowForLayout({ isOpen: true, showCollapsedCallControls: false });
    sendSoftphoneCommand("open");
  }

  sendWindowState();
  buildApplicationMenu();
  updateTrayMenu();
}

function setAlwaysOnTop(nextAlwaysOnTop) {
  alwaysOnTop = Boolean(nextAlwaysOnTop);

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.setAlwaysOnTop(alwaysOnTop, "floating");

  if (process.platform === "darwin") {
    mainWindow.setVisibleOnAllWorkspaces(alwaysOnTop, {
      visibleOnFullScreen: true,
    });
  }

  sendWindowState();
  buildApplicationMenu();
  updateTrayMenu();
}

async function requestMacMicrophoneAccess() {
  if (process.platform !== "darwin") {
    return;
  }

  try {
    await systemPreferences.askForMediaAccess("microphone");
  } catch {
    // The web app will show its own Twilio error if microphone access is unavailable.
  }
}

function configurePermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    const trustedOrigin = url.startsWith("https://crm.id30.com");

    if (trustedOrigin && permission === "media") {
      callback(true);
      return;
    }

    callback(false);
  });

}

function configureAutoUpdates() {
  if (!app.isPackaged || process.env.ID30_DISABLE_AUTO_UPDATE === "1") {
    publishUpdateState({
      configured: false,
      status: "disabled",
      message: app.isPackaged
        ? "Updates are disabled for this app."
        : "Updates are available in packaged builds.",
    });
    return;
  }

  if (!updateBaseUrl && !updateRepo) {
    console.log("Desktop softphone auto-updates are not configured.");
    publishUpdateState({
      configured: false,
      status: "disabled",
      message: "Updates are not configured.",
    });
    return;
  }

  updateFeedConfigured = true;
  const updateSource = updateBaseUrl
    ? {
        type: UpdateSourceType.StaticStorage,
        baseUrl: `${updateBaseUrl.replace(/\/$/, "")}/${process.platform}/${process.arch}`,
      }
    : {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: updateRepo,
      };
  let feedURL = "";
  let serverType = "default";

  if (updateSource.type === UpdateSourceType.StaticStorage) {
    feedURL = updateSource.baseUrl;

    if (process.platform === "darwin") {
      feedURL += "/RELEASES.json";
      serverType = "json";
    }
  } else {
    const formatSegment = process.windowsStore ? "/msix" : "";
    feedURL = `https://update.electronjs.org/${updateSource.repo}/${process.platform}-${process.arch}${formatSegment}/${app.getVersion()}`;
  }

  autoUpdater.setFeedURL({
    url: feedURL,
    serverType,
  });

  autoUpdater.on("checking-for-update", () => {
    publishUpdateState({
      status: "checking",
      message: "Checking for updates...",
      error: null,
      checkedAt: new Date().toISOString(),
    });
  });

  autoUpdater.on("update-available", () => {
    publishUpdateState({
      status: "downloading",
      message: "Update found. Downloading...",
      error: null,
    });
  });

  autoUpdater.on("update-not-available", () => {
    publishUpdateState({
      status: "current",
      message: "You are on the latest version.",
      error: null,
      checkedAt: new Date().toISOString(),
    });
  });

  autoUpdater.on("update-downloaded", (_event, _releaseNotes, releaseName) => {
    publishUpdateState({
      status: "ready",
      latestVersion: releaseName || null,
      message: hasActiveCall
        ? "Update downloaded. It will install automatically when this call ends."
        : "Update downloaded. Installing automatically...",
      error: null,
      downloadedAt: new Date().toISOString(),
    });
    maybeAutoInstallUpdate();
  });

  autoUpdater.on("error", (error) => {
    publishUpdateState({
      status: "error",
      message: "Update check failed.",
      error: error?.message ?? String(error),
    });
  });

  publishUpdateState({
    configured: true,
    status: "idle",
    message: "Updates are enabled.",
  });
  checkForDesktopUpdate();
  updateCheckTimer = setInterval(checkForDesktopUpdate, 15 * 60 * 1000);
}

function checkForDesktopUpdate() {
  if (!app.isPackaged || !updateFeedConfigured) {
    publishUpdateState({
      status: updateFeedConfigured ? "disabled" : "disabled",
      message: app.isPackaged
        ? "Updates are not configured."
        : "Updates are available in packaged builds.",
    });
    return updateState;
  }

  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    publishUpdateState({
      status: "error",
      message: "Update check failed.",
      error: error?.message ?? String(error),
    });
  }

  return updateState;
}

function installDesktopUpdate() {
  if (updateState.status !== "ready") {
    checkForDesktopUpdate();
    return updateState;
  }

  autoUpdater.quitAndInstall();
  return updateState;
}

function updateMenuLabel() {
  if (!updateState.configured) return "Updates unavailable";
  if (updateState.status === "checking") return "Checking for updates...";
  if (updateState.status === "downloading") return "Downloading update...";
  if (updateState.status === "ready") return "Update will install automatically";
  if (updateState.status === "installing") return "Installing update...";
  if (updateState.status === "current") return "Up to date";
  if (updateState.status === "error") return "Update check failed";
  return "Updates enabled";
}

function shouldKeepNavigationInApp(url) {
  try {
    const nextUrl = new URL(url);

    return (
      nextUrl.origin === softphoneOrigin &&
      appWindowPaths.has(nextUrl.pathname)
    );
  } catch {
    return false;
  }
}

function escapeAppleScriptString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function crmUrlUsesAppOrigin(url) {
  try {
    return new URL(url).origin === softphoneOrigin;
  } catch {
    return false;
  }
}

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout.trim());
    });
  });
}

async function openCrmUrlInChrome(url) {
  const targetUrl = escapeAppleScriptString(url);
  const crmOrigin = escapeAppleScriptString(softphoneOrigin);
  const script = `
set targetUrl to "${targetUrl}"
set crmOrigin to "${crmOrigin}"
tell application "System Events"
  set chromeRunning to exists process "Google Chrome"
end tell
if chromeRunning is false then
  return "no-chrome"
end if
tell application "Google Chrome"
  activate
  if (count of windows) is 0 then
    make new window
    set URL of active tab of front window to targetUrl
    return "opened-window"
  end if
  set activeUrl to URL of active tab of front window
  if activeUrl starts with crmOrigin then
    set URL of active tab of front window to targetUrl
    return "updated-active"
  end if
  repeat with windowIndex from 1 to count of windows
    set tabCount to count of tabs of window windowIndex
    repeat with tabIndex from 1 to tabCount
      set tabUrl to URL of tab tabIndex of window windowIndex
      if tabUrl starts with crmOrigin then
        set targetWindow to window windowIndex
        set active tab index of targetWindow to tabIndex
        set index of targetWindow to 1
        set URL of active tab of targetWindow to targetUrl
        activate
        return "updated-existing"
      end if
    end repeat
  end repeat
  tell front window to make new tab at end of tabs with properties {URL:targetUrl}
  set active tab index of front window to count of tabs of front window
  activate
  return "opened-tab"
end tell
`;

  return runAppleScript(script);
}

async function openExternalUrl(url) {
  if (!crmUrlUsesAppOrigin(url)) {
    await shell.openExternal(url);
    return;
  }

  if (process.platform === "darwin") {
    try {
      const result = await openCrmUrlInChrome(url);

      if (result !== "no-chrome") {
        return;
      }
    } catch {
      // Fall back to the default browser opener when Chrome automation is unavailable.
    }
  }

  await shell.openExternal(url);
}

function optionalProtocolParam(searchParams, key) {
  const value = searchParams.get(key);
  return value && value.trim() ? value.trim() : undefined;
}

function dialPayloadFromProtocolUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const action = parsedUrl.hostname || parsedUrl.pathname.replace(/^\//, "");

    if (parsedUrl.protocol !== `${protocolScheme}:` || action !== "dial") {
      return null;
    }

    const phone = optionalProtocolParam(parsedUrl.searchParams, "phone");

    if (!phone) {
      return null;
    }

    return {
      phone,
      contactName: optionalProtocolParam(parsedUrl.searchParams, "contactName"),
      contextName: optionalProtocolParam(parsedUrl.searchParams, "contextName"),
      opportunityId: optionalProtocolParam(parsedUrl.searchParams, "opportunityId"),
      contactId: optionalProtocolParam(parsedUrl.searchParams, "contactId"),
    };
  } catch {
    return null;
  }
}

function handleProtocolUrl(url) {
  const dialPayload = dialPayloadFromProtocolUrl(url);

  if (!dialPayload) {
    return false;
  }

  focusOrCreateWindow();
  sendDialCommand(dialPayload);
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...windowSizes.open,
    minWidth: windowSizes.trigger.width,
    minHeight: windowSizes.trigger.height,
    title: "iD30 Softphone",
    icon: getIcon(),
    show: false,
    alwaysOnTop,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: assetPath("src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url).catch(() => {});
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (shouldKeepNavigationInApp(url)) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url).catch(() => {});
  });

  mainWindow.webContents.on("did-navigate", (_event, url) => {
    try {
      const currentUrl = new URL(url);

      if (currentUrl.origin === softphoneOrigin && currentUrl.pathname === "/") {
        mainWindow.loadURL(softphoneUrl);
      }
    } catch {
      // Ignore non-standard URLs emitted during internal browser navigation.
    }
  });
  mainWindow.webContents.on("did-finish-load", flushPendingDialCommands);
  mainWindow.webContents.on("did-finish-load", () => {
    sendWindowState();
    publishUpdateState();
  });

  mainWindow.loadURL(softphoneUrl);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    setAlwaysOnTop(alwaysOnTop);
    sendWindowState();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function focusOrCreateWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function buildApplicationMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Softphone",
      submenu: [
        {
          label: compactMode ? "Expand" : "Compact",
          accelerator: "CommandOrControl+M",
          click: () => setCompactMode(!compactMode),
        },
        {
          label: "Always on top",
          type: "checkbox",
          checked: alwaysOnTop,
          click: (item) => setAlwaysOnTop(item.checked),
        },
        { type: "separator" },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false,
        },
        {
          label: updateMenuLabel(),
          enabled: false,
        },
        {
          label: "Check now",
          enabled:
            updateState.configured &&
            updateState.status !== "checking" &&
            updateState.status !== "downloading" &&
            updateState.status !== "installing",
          click: checkForDesktopUpdate,
        },
        { type: "separator" },
        {
          label: "Reload",
          accelerator: "CommandOrControl+R",
          click: () => mainWindow?.reload(),
        },
        {
          label: "Open CRM",
          click: () => openExternalUrl("https://crm.id30.com").catch(() => {}),
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show softphone",
        click: focusOrCreateWindow,
      },
      {
        label: compactMode ? "Expand" : "Compact",
        click: () => setCompactMode(!compactMode),
      },
      {
        label: "Always on top",
        type: "checkbox",
        checked: alwaysOnTop,
        click: (item) => setAlwaysOnTop(item.checked),
      },
      { type: "separator" },
      {
        label: `Version ${app.getVersion()}`,
        enabled: false,
      },
      {
        label: updateMenuLabel(),
        enabled: false,
      },
      {
        label: "Check now",
        enabled:
          updateState.configured &&
          updateState.status !== "checking" &&
          updateState.status !== "downloading" &&
          updateState.status !== "installing",
        click: checkForDesktopUpdate,
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => app.quit(),
      },
    ]),
  );
}

function createTray() {
  const icon = getIcon();

  if (!icon) {
    return;
  }

  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip("iD30 Softphone");
  tray.on("click", focusOrCreateWindow);
  updateTrayMenu();
}

ipcMain.handle("desktop-softphone:set-compact", (_event, nextCompactMode) => {
  setCompactMode(nextCompactMode);
  return { alwaysOnTop, compactMode };
});

ipcMain.handle("desktop-softphone:set-always-on-top", (_event, nextAlwaysOnTop) => {
  setAlwaysOnTop(nextAlwaysOnTop);
  return { alwaysOnTop, compactMode };
});

ipcMain.handle("desktop-softphone:get-state", () => ({
  alwaysOnTop,
  compactMode,
}));

ipcMain.handle("desktop-softphone:get-update-state", () => updateState);

ipcMain.handle("desktop-softphone:check-for-updates", () => checkForDesktopUpdate());

ipcMain.handle("desktop-softphone:install-update", () => installDesktopUpdate());

ipcMain.on("desktop-softphone:layout", (_event, layout) => {
  if (!layout || typeof layout !== "object") {
    return;
  }

  compactMode = !Boolean(layout.isOpen);
  hasActiveCall = Boolean(layout.hasActiveCall);
  resizeWindowForLayout({
    isOpen: Boolean(layout.isOpen),
    hasPanel: Boolean(layout.hasPanel),
    showCollapsedCallControls: Boolean(layout.showCollapsedCallControls),
  });
  if (pendingAutoInstall && !hasActiveCall) {
    maybeAutoInstallUpdate();
  }
  buildApplicationMenu();
  updateTrayMenu();
});

ipcMain.on("desktop-softphone:drag-move", (_event, payload) => {
  const deltaX = Number(payload?.deltaX);
  const deltaY = Number(payload?.deltaY);

  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    return;
  }

  moveWindowBy(deltaX, deltaY);
});

app.whenReady().then(async () => {
  app.setName("iD30 Softphone");
  app.setAsDefaultProtocolClient(protocolScheme);
  const icon = getIcon();

  if (process.platform === "darwin" && icon) {
    app.dock?.show();
    app.dock?.setIcon(icon);
  }

  configureAutoUpdates();
  configurePermissions();
  await requestMacMicrophoneAccess();
  buildApplicationMenu();
  createTray();
  createWindow();
  process.argv.forEach((arg) => {
    if (arg.startsWith(`${protocolScheme}:`)) {
      handleProtocolUrl(arg);
    }
  });
});

app.on("activate", focusOrCreateWindow);

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    focusOrCreateWindow();
    argv.forEach((arg) => {
      if (arg.startsWith(`${protocolScheme}:`)) {
        handleProtocolUrl(arg);
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
