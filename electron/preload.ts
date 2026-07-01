import { contextBridge, ipcRenderer, webUtils } from "electron";

// ── Type definitions (mirrored in renderer/src/types/ipc.ts) ──────

export type AppManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  entry: { frontend?: string; backend?: string };
  capabilities?: string[];
  permissions?: { scope: string; reason?: string }[];
  webPreview?: string;
};

export type PackageInfo = {
  dir: string;
  frontendDir: string;
  manifest: AppManifest;
  entries: string[];
};

export type RunParams = {
  appDir: string;
  entryFile: string;
  method: string;
  params: unknown;
  mockContext: MockContext;
};

export type MockContext = {
  userId?: string;
  deviceId?: string;
  scopes?: string[];
};

export type LogEntry = {
  level: "log" | "warn" | "error" | "info";
  message: string;
  ts: number;
};

export type RunResult = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  durationMs: number;
};

export type KvRow = { key: string; value: string; type: string; updatedAt: number };
export type DbTable = { name: string; rows: Record<string, unknown>[] };

export type CaptureParams = {
  data: string; // base64 (screenshot) or blob URL (video)
  mimeType: "image/png" | "video/webm";
  filename: string;
  role: "cover" | "carousel" | "logo" | "none";
  appDir: string;
};

contextBridge.exposeInMainWorld("devtool", {
  // App info
  app: {
    getInfo: (): Promise<{
      name: string;
      version: string;
      electron: string;
      chromium: string;
      node: string;
      v8: string;
      os: string;
    }> => ipcRenderer.invoke("app:getInfo"),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    openDevTools: () => ipcRenderer.send("window:openDevTools"),
    enterMain: () => ipcRenderer.send("window:enterMain"),
    enterWelcome: () => ipcRenderer.send("window:enterWelcome"),
  },

  // Theme
  theme: {
    get: () => ipcRenderer.invoke("theme:get"),
    set: (theme: "system" | "light" | "dark") =>
      ipcRenderer.invoke("theme:set", theme),
  },

  // Shell
  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke("shell:openExternal", url),
    showItemInFolder: (path: string) =>
      ipcRenderer.invoke("shell:showItemInFolder", path),
  },

  // File utils
  fileUtils: {
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  },

  // Package / folder management
  package: {
    openFolder: (): Promise<PackageInfo | null> =>
      ipcRenderer.invoke("package:openFolder"),
    loadFolder: (dirPath: string): Promise<PackageInfo> =>
      ipcRenderer.invoke("package:loadFolder", dirPath),
    getRecent: (): Promise<string[]> =>
      ipcRenderer.invoke("package:getRecent"),
    clearRecent: (): Promise<void> =>
      ipcRenderer.invoke("package:clearRecent"),
    onHotReload: (
      cb: (event: { type: "frontend" | "backend" }) => void
    ) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        event: { type: "frontend" | "backend" }
      ) => cb(event);
      ipcRenderer.on("package:hotReload", handler);
      return () =>
        ipcRenderer.removeListener("package:hotReload", handler);
    },
    saveManifest: (dir: string, manifest: AppManifest): Promise<void> =>
      ipcRenderer.invoke("package:saveManifest", dir, manifest),
    onManifestReload: (cb: (manifest: AppManifest) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, manifest: AppManifest) => cb(manifest);
      ipcRenderer.on("package:manifestReload", handler);
      return () => ipcRenderer.removeListener("package:manifestReload", handler);
    },
    onWarningsChanged: (cb: (warnings: string[]) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, warnings: string[]) => cb(warnings);
      ipcRenderer.on("package:warningsChanged", handler);
      return () => ipcRenderer.removeListener("package:warningsChanged", handler);
    },
    readImage: (appDir: string, relPath: string): Promise<string | null> =>
      ipcRenderer.invoke("package:readImage", appDir, relPath),
    saveImageFile: (appDir: string, relPath: string, dataUrl: string): Promise<void> =>
      ipcRenderer.invoke("package:saveImageFile", appDir, relPath, dataUrl),
    listImages: (appDir: string, subPath: string): Promise<string[]> =>
      ipcRenderer.invoke("package:listImages", appDir, subPath),
    deleteImageFile: (appDir: string, relPath: string): Promise<void> =>
      ipcRenderer.invoke("package:deleteImageFile", appDir, relPath),
    pickImageFiles: (appDir: string, multi: boolean): Promise<{ dataUrl: string; filename: string }[]> =>
      ipcRenderer.invoke("package:pickImageFiles", appDir, multi),
    onAssetsChanged: (cb: (info: { role: "cover" | "carousel" | "logo"; appDir: string; filename: string; relPath: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, info: { role: "cover" | "carousel" | "logo"; appDir: string; filename: string; relPath: string }) => cb(info);
      ipcRenderer.on("package:assetsChanged", handler);
      return () => ipcRenderer.removeListener("package:assetsChanged", handler);
    },
    build: (appDir: string): Promise<{ outputPath: string } | null> =>
      ipcRenderer.invoke("package:build", appDir),
  },

  // Execution
  execution: {
    run: (params: RunParams): Promise<RunResult> =>
      ipcRenderer.invoke("execution:run", params),
    cancel: (): Promise<void> => ipcRenderer.invoke("execution:cancel"),
    isRunning: (): Promise<boolean> =>
      ipcRenderer.invoke("execution:isRunning"),

    onLog: (cb: (entry: LogEntry) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, entry: LogEntry) =>
        cb(entry);
      ipcRenderer.on("execution:log", handler);
      return () => ipcRenderer.removeListener("execution:log", handler);
    },
    onStatus: (cb: (status: "idle" | "running" | "error") => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        status: "idle" | "running" | "error"
      ) => cb(status);
      ipcRenderer.on("execution:status", handler);
      return () =>
        ipcRenderer.removeListener("execution:status", handler);
    },
  },

  // DB (SQLite table browser)
  db: {
    getTables: (dbPath: string): Promise<string[]> =>
      ipcRenderer.invoke("kv:getTables", dbPath),
    getTableRows: (
      dbPath: string,
      table: string,
      limit: number,
      offset: number
    ): Promise<{ rows: Record<string, unknown>[]; total: number }> =>
      ipcRenderer.invoke("kv:getTableRows", dbPath, table, limit, offset),
    runQuery: (
      dbPath: string,
      sql: string
    ): Promise<{ columns: string[]; rows: unknown[][] }> =>
      ipcRenderer.invoke("kv:runQuery", dbPath, sql),
    exportDb: (dbPath: string): Promise<string> =>
      ipcRenderer.invoke("kv:exportDb", dbPath),
  },

  // KV store (shapp_kv table)
  kv: {
    getAllEntries: (dbPath: string): Promise<Array<{ key: string; value: string; updatedAt: number }>> =>
      ipcRenderer.invoke("kv:getAllEntries", dbPath),
    setEntry: (dbPath: string, key: string, value: string): Promise<void> =>
      ipcRenderer.invoke("kv:setEntry", dbPath, key, value),
    deleteEntry: (dbPath: string, key: string): Promise<void> =>
      ipcRenderer.invoke("kv:deleteEntry", dbPath, key),
    clearAll: (dbPath: string): Promise<void> =>
      ipcRenderer.invoke("kv:clearAll", dbPath),
    importEntries: (dbPath: string, entries: Array<{ key: string; value: string }>): Promise<void> =>
      ipcRenderer.invoke("kv:importEntries", dbPath, entries),
  },

  // Git version management (isomorphic-git)
  git: {
    init: (projectDir: string): Promise<string> =>
      ipcRenderer.invoke("git:init", projectDir),
    commit: (projectDir: string, message: string): Promise<string> =>
      ipcRenderer.invoke("git:commit", projectDir, message),
    log: (projectDir: string, depth?: number, branch?: string): Promise<import("./ipc/gitService").GitCommitInfo[]> =>
      ipcRenderer.invoke("git:log", projectDir, depth, branch),
    graph: (projectDir: string): Promise<import("./ipc/gitService").GitGraphData> =>
      ipcRenderer.invoke("git:graph", projectDir),
    status: (projectDir: string): Promise<import("./ipc/gitService").GitStatusEntry[]> =>
      ipcRenderer.invoke("git:status", projectDir),
    listBranches: (projectDir: string): Promise<import("./ipc/gitService").GitBranchInfo[]> =>
      ipcRenderer.invoke("git:listBranches", projectDir),
    createBranch: (projectDir: string, branchName: string): Promise<void> =>
      ipcRenderer.invoke("git:createBranch", projectDir, branchName),
    switchBranch: (projectDir: string, branchName: string): Promise<void> =>
      ipcRenderer.invoke("git:switchBranch", projectDir, branchName),
    currentBranch: (projectDir: string): Promise<string> =>
      ipcRenderer.invoke("git:currentBranch", projectDir),
    diff: (projectDir: string, oid1?: string, oid2?: string): Promise<import("./ipc/gitService").GitDiffEntry[]> =>
      ipcRenderer.invoke("git:diff", projectDir, oid1, oid2),
    revertFile: (projectDir: string, filepath: string): Promise<void> =>
      ipcRenderer.invoke("git:revertFile", projectDir, filepath),
    resetToCommit: (projectDir: string, oid: string): Promise<void> =>
      ipcRenderer.invoke("git:resetToCommit", projectDir, oid),
    autoCommit: (projectDir: string, taskId: string, summary: string): Promise<import("./ipc/gitService").AutoCommitResult | null> =>
      ipcRenderer.invoke("git:autoCommit", projectDir, taskId, summary),
  },

  // Checkpoint storage (SQLite)
  checkpoint: {
    createTask: (sessionId: string, projectDir: string, title?: string): Promise<import("./ipc/checkpoint").TaskRow> =>
      ipcRenderer.invoke("checkpoint:createTask", sessionId, projectDir, title),
    updateTaskStatus: (id: string, status: "running" | "completed" | "error"): Promise<void> =>
      ipcRenderer.invoke("checkpoint:updateTaskStatus", id, status),
    getTask: (id: string): Promise<import("./ipc/checkpoint").TaskRow | undefined> =>
      ipcRenderer.invoke("checkpoint:getTask", id),
    listTasks: (projectDir: string): Promise<import("./ipc/checkpoint").TaskRow[]> =>
      ipcRenderer.invoke("checkpoint:listTasks", projectDir),
    deleteTask: (id: string): Promise<void> =>
      ipcRenderer.invoke("checkpoint:deleteTask", id),
    listCheckpoints: (taskId: string): Promise<import("./ipc/checkpoint").CheckpointRow[]> =>
      ipcRenderer.invoke("checkpoint:listCheckpoints", taskId),
    getTaskWithCheckpoints: (taskId: string): Promise<import("./ipc/checkpoint").TaskWithCheckpoints | undefined> =>
      ipcRenderer.invoke("checkpoint:getTaskWithCheckpoints", taskId),
    listTasksWithCheckpoints: (projectDir: string): Promise<import("./ipc/checkpoint").TaskWithCheckpoints[]> =>
      ipcRenderer.invoke("checkpoint:listTasksWithCheckpoints", projectDir),
  },

  // Extensions (VS Code-compatible)
  extensions: {
    list: (): Promise<import("./ipc/extensions").VSCodeExtension[]> =>
      ipcRenderer.invoke("extensions:list"),
    installFromDialog: (): Promise<import("./ipc/extensions").VSCodeExtension | null> =>
      ipcRenderer.invoke("extensions:installFromDialog"),
    install: (vsixPath: string): Promise<import("./ipc/extensions").VSCodeExtension> =>
      ipcRenderer.invoke("extensions:install", vsixPath),
    uninstall: (extensionId: string): Promise<void> =>
      ipcRenderer.invoke("extensions:uninstall", extensionId),
    setEnabled: (extensionId: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke("extensions:setEnabled", extensionId, enabled),
    getIcon: (extensionId: string): Promise<string | null> =>
      ipcRenderer.invoke("extensions:getIcon", extensionId),
  },

  // Static server for preview
  server: {
    start: (appDir: string, frontendDir?: string): Promise<{ url: string; port: number }> =>
      ipcRenderer.invoke("server:start", appDir, frontendDir),
    stop: (): Promise<void> => ipcRenderer.invoke("server:stop"),
    getUrl: (): Promise<string | null> =>
      ipcRenderer.invoke("server:getUrl"),
    getLanUrl: (): Promise<string | null> =>
      ipcRenderer.invoke("server:getLanUrl"),
  },

  // Capture
  capture: {
    screenshot: (rect?: { x: number; y: number; width: number; height: number }): Promise<string> =>
      ipcRenderer.invoke("capture:screenshot", rect),
    getWindowSourceId: (): Promise<string> =>
      ipcRenderer.invoke("capture:getWindowSourceId"),
    saveMedia: (params: CaptureParams): Promise<string> =>
      ipcRenderer.invoke("capture:saveMedia", params),
    openSaveDialog: (defaultName: string): Promise<string | null> =>
      ipcRenderer.invoke("capture:openSaveDialog", defaultName),
  },

  // Auto-updater
  update: {
    check: (): Promise<void> => ipcRenderer.invoke("update:check"),
    download: (): Promise<void> => ipcRenderer.invoke("update:download"),
    install: (): Promise<void> => ipcRenderer.invoke("update:install"),
    onStatus: (cb: (status: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, status: unknown) =>
        cb(status);
      ipcRenderer.on("update:status", handler);
      return () => ipcRenderer.removeListener("update:status", handler);
    },
  },

  // Coding Agent (OpenCode)
  agent: {
    ping: (): Promise<boolean> =>
      ipcRenderer.invoke("agent:ping"),
    startServer: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke("agent:startServer"),
    setProject: (dir: string): Promise<void> =>
      ipcRenderer.invoke("agent:setProject", dir),
    createSession: (directory?: string): Promise<import("./ipc/agent").AgentSession> =>
      ipcRenderer.invoke("agent:createSession", directory),
    listSessions: (): Promise<import("./ipc/agent").AgentSession[]> =>
      ipcRenderer.invoke("agent:listSessions"),
    deleteSession: (id: string): Promise<void> =>
      ipcRenderer.invoke("agent:deleteSession", id),
    getMessages: (sessionId: string): Promise<import("./ipc/agent").AgentMessage[]> =>
      ipcRenderer.invoke("agent:getMessages", sessionId),
    pickFile: (): Promise<{ name: string; mime: string; url: string }[]> =>
      ipcRenderer.invoke("agent:pickFile"),
    sendPrompt: (sessionId: string, text: string, projectDir?: string, mode?: string, files?: { name: string; mime: string; url: string }[]): Promise<void> =>
      ipcRenderer.invoke("agent:sendPrompt", sessionId, text, projectDir, mode, files),
    abortSession: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke("agent:abortSession", sessionId),
    listProviders: (): Promise<import("./ipc/agent").AgentProvider[]> =>
      ipcRenderer.invoke("agent:listProviders"),
    getConfig: (): Promise<{
      freeModels: { id: string; name: string; providerId: string }[];
      providerGroups: { id: string; name: string; models: { id: string; name: string }[] }[];
      defaultProviderId: string;
      defaultModelId: string;
    }> => ipcRenderer.invoke("agent:getConfig"),
    setApiKey: (providerId: string, key: string): Promise<void> =>
      ipcRenderer.invoke("agent:setApiKey", providerId, key),
    setProviderConfig: (providerId: string, config: { type: "api" | "oauth"; key?: string; options?: Record<string, string> }): Promise<void> =>
      ipcRenderer.invoke("agent:setProviderConfig", providerId, config),
    listCatalogProviders: (): Promise<import("./ipc/agent").AgentCatalogProvider[]> =>
      ipcRenderer.invoke("agent:listCatalogProviders"),
    getPrefs: (): Promise<{ width: number; visible: boolean; selectedProvider: string; selectedModel: string; mode: "build" | "plan" }> =>
      ipcRenderer.invoke("agent:getPrefs"),
    setPrefs: (prefs: { width?: number; visible?: boolean; selectedProvider?: string; selectedModel?: string; mode?: "build" | "plan" }): Promise<void> =>
      ipcRenderer.invoke("agent:setPrefs", prefs),
    subscribe: (): Promise<void> =>
      ipcRenderer.invoke("agent:subscribe"),
    unsubscribe: (): Promise<void> =>
      ipcRenderer.invoke("agent:unsubscribe"),
    onEvent: (cb: (event: import("./ipc/agent").AgentEvent) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: import("./ipc/agent").AgentEvent) =>
        cb(event);
      ipcRenderer.on("agent:event", handler);
      return () => ipcRenderer.removeListener("agent:event", handler);
    },
    answerQuestion: (answers: string[][]): Promise<void> =>
      ipcRenderer.invoke("agent:answerQuestion", answers),
    onQuestion: (cb: (data: { id: string; sessionID: string; questions: Array<{ header: string; question: string; options: Array<{ label: string; description: string }>; multiple?: boolean; custom?: boolean }> }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data);
      ipcRenderer.on("agent:question", handler);
      return () => ipcRenderer.removeListener("agent:question", handler);
    },
  },
});
