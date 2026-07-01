import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeTheme,
} from "electron";
import { join } from "path";
import * as os from "os";
import * as os from "os";
import { registerPackageHandlers } from "./ipc/package";
import { registerExecutionHandlers, setServerUrlGetter } from "./ipc/execution";
import { registerKvHandlers } from "./ipc/kv";
import { registerServerHandlers } from "./ipc/server";
import { registerCaptureHandlers } from "./ipc/capture";
import { registerAgentHandlers, stopAgentSubscription } from "./ipc/agent";
import { registerGitHandlers, closeCheckpointDb } from "./ipc/gitIpc";
import { registerExtensionHandlers } from "./ipc/extensions";
import { StaticServer } from "./server/static";
import { Store } from "./store";
import { initUpdater } from "./updater";

// ── Globals ──────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

type StoreSchema = {
  recentFolders: string[];
  lastMockContext: Record<string, unknown>;
  lastInputs: Record<string, string>;
  windowBounds: { x: number; y: number; width: number; height: number };
  mainWindowBounds: { width: number; height: number };
  theme: "system" | "light" | "dark";
  locale: "zh" | "en";
  guideShown: boolean;
  panelSplit: number;
  agentPanel: {
    width: number;
    visible: boolean;
    selectedProvider: string;
    selectedModel: string;
    encryptedKeys: Record<string, string>;
  };
};

const STORE_DEFAULTS: StoreSchema = {
  recentFolders: [],
  lastMockContext: {
    userId: "dev_user_001",
    deviceId: "dev_device_local",
    scopes: ["db.*"],
  },
  lastInputs: {},
  windowBounds: { x: 0, y: 0, width: 820, height: 520 },
  mainWindowBounds: { width: 1280, height: 800 },
  theme: "system",
  locale: "zh",
  guideShown: false,
  panelSplit: 50,
  agentPanel: {
    width: 360,
    visible: false,
    selectedProvider: "anthropic",
    selectedModel: "claude-opus-4-5",
    encryptedKeys: {},
  },
};

// Lazily initialized after app is ready
let _store: Store<StoreSchema> | null = null;
export function getStore(): Store<StoreSchema> {
  if (!_store) _store = new Store<StoreSchema>(STORE_DEFAULTS);
  return _store;
}
// Keep backward-compat alias used by IPC files
export const store = {
  get: <K extends keyof StoreSchema>(key: K) => getStore().get(key),
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => getStore().set(key, value),
};

export const staticServer = new StaticServer();

// Track whether the main project layout is active (used for bounds saving)
let inMainMode = false;

// ── App lifecycle ─────────────────────────────────────────────────

function getWindowIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "logo.ico")
    : join(__dirname, "../../resources/logo.ico");
}

function createWindow() {
  const theme = store.get("theme");
  if (theme !== "system") {
    nativeTheme.themeSource = theme;
  }

  mainWindow = new BrowserWindow({
    width: 820,
    height: 520,
    minWidth: 620,
    minHeight: 420,
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
    icon: process.platform === "win32" ? getWindowIconPath() : undefined,
    backgroundColor: "#F2F2F7",
    show: false,
  });

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow!.center();
    mainWindow!.show();
    if (process.env.NODE_ENV === "development") {
      mainWindow!.webContents.openDevTools({ mode: "detach" });
    }
  });

  mainWindow.on("close", () => {
    if (mainWindow && inMainMode) {
      const b = mainWindow.getBounds();
      store.set("mainWindowBounds", { width: b.width, height: b.height });
    }
    staticServer.stop();
    stopAgentSubscription();
    closeCheckpointDb();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return mainWindow;
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.shapp.devtool");
  }

  const win = createWindow();

  // Register IPC handlers
  registerPackageHandlers(win);
  registerExecutionHandlers(win);
  setServerUrlGetter(() => staticServer.getUrl());
  registerKvHandlers();
  registerServerHandlers();
  registerCaptureHandlers(win);
  registerAgentHandlers(win);
  registerGitHandlers(win);
  registerExtensionHandlers(win);

  // Window controls IPC
  ipcMain.on("window:minimize", () => win.minimize());
  ipcMain.on("window:maximize", () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("window:close", () => win.close());
  ipcMain.on("window:openDevTools", () => win.webContents.openDevTools({ mode: "detach" }));

  // Welcome ↔ Main layout resize IPC
  ipcMain.on("window:enterMain", () => {
    inMainMode = true;
    win.setMinimumSize(900, 600);
    if (!win.isMaximized()) {
      win.maximize();
    }
  });
  ipcMain.on("window:enterWelcome", () => {
    if (inMainMode) {
      const b = win.getBounds();
      store.set("mainWindowBounds", { width: b.width, height: b.height });
    }
    inMainMode = false;
    if (win.isMaximized()) {
      win.unmaximize();
    }
    win.setMinimumSize(620, 420);
    win.setSize(820, 520);
    win.center();
  });

  // Theme IPC
  ipcMain.handle("theme:get", () => store.get("theme"));
  ipcMain.handle("theme:set", (_e, theme: "system" | "light" | "dark") => {
    store.set("theme", theme);
    nativeTheme.themeSource = theme === "system" ? "system" : theme;
  });

  // App info (for About dialog)
  ipcMain.handle("app:getInfo", () => ({
    name: "Shapp DevTool",
    version: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${os.type()} ${os.arch()} ${os.release()}`,
  }));

  // Open external URL
  ipcMain.handle("shell:openExternal", (_e, url: string) => {
    // Only allow http/https
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
    }
  });

  // Open folder dialog (for devtools show folder)
  ipcMain.handle("shell:showItemInFolder", (_e, path: string) => {
    shell.showItemInFolder(path);
  });

  // Auto-updater
  initUpdater(win);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
