// IPC API types exposed via contextBridge
// These mirror the definitions in electron/preload.ts

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "not-available" }
  | { state: "available"; version: string; releaseDate: string }
  | { state: "downloading"; version: string; percent: number; bytesPerSecond: number; total: number; transferred: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

export type AppManifest = {
  id: string;
  name: string;
  version: string;
  title?: string;
  description?: string;
  engine?: string;
  runtime?: string;
  entry: { frontend?: string; backend?: string; admin?: string };
  capabilities?: string[];
  permissions?: { scope: string; reason?: string }[];
  webPreview?: string;
  logo?: string;
  images?: string[];
};

export type PackageInfo = {
  dir: string;
  frontendDir: string;
  manifest: AppManifest;
  entries: string[];
  /** 结构校验警告（与上传校验保持一致），不阻塞运行但会在预览界面展示 */
  warnings: string[];
};

export type MockGeo = {
  enabled: boolean;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy: number;
};

export type MockContext = {
  userId?: string;
  deviceId?: string;
  scopes?: string[];
  nickname?: string;
  roles?: string[];
  /** 模拟界面语言（对应 window.__SHAPP_LOCALE__） */
  locale?: string;
  /** 模拟管理员身份（对应 ctx.isAdmin = true） */
  isAdmin?: boolean;
  /** 模拟设备位置（注入 navigator.geolocation） */
  geo?: MockGeo;
};

export type RunParams = {
  appDir: string;
  entryFile: string;
  method: string;
  params: unknown;
  mockContext: MockContext;
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

export type CaptureParams = {
  data: string;
  mimeType: "image/png" | "video/webm";
  filename: string;
  role: "cover" | "carousel" | "logo" | "none";
  appDir: string;
};

// ── Agent (OpenCode) types ─────────────────────────────────────────

export type AgentSession = {
  id: string;
  title: string;
  createdAt: number;
};

export type AgentMessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; callID: string; toolName: string; args: Record<string, unknown>; result?: string; status: "pending" | "running" | "completed" | "error" }
  | { type: "file"; mimeType: string; url: string; filename?: string };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  parts: AgentMessagePart[];
  createdAt: number;
};

export type AgentProvider = {
  id: string;
  name: string;
  models: { id: string; name: string }[];
};

export type AgentEvent =
  | { type: "message.part"; sessionId: string; messageId: string; part: AgentMessagePart }
  | { type: "message.completed"; sessionId: string; message: AgentMessage }
  | { type: "session.updated"; session: AgentSession }
  | { type: "error"; sessionId?: string; message: string };

export type AgentPrefs = {
  width: number;
  visible: boolean;
  selectedProvider: string;
  selectedModel: string;
  mode: "build" | "plan";
};

export type FileAttachment = {
  name: string;
  mime: string;
  url: string;
};

export type AgentFreeModel = {
  id: string;
  name: string;
  providerId: string;
};

export type AgentProviderGroup = {
  id: string;
  name: string;
  models: { id: string; name: string }[];
};

export type ModelCapabilities = {
  temperature: boolean;
  reasoning: boolean;
  attachment: boolean;
  toolcall: boolean;
  input: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean };
  output: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean };
};

export type ModelCost = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type ModelLimit = {
  context: number;
  input?: number;
  output: number;
};

export type ModelVariant = {
  id: string;
  name: string;
  disabled?: boolean;
};

export type CatalogModel = {
  id: string;
  name: string;
  family?: string;
  status?: "alpha" | "beta" | "deprecated" | "active";
  capabilities?: ModelCapabilities;
  cost?: ModelCost;
  limit?: ModelLimit;
  releaseDate?: string;
  variants?: ModelVariant[];
};

export type AuthPrompt = {
  type: "text" | "select";
  key: string;
  message: string;
  placeholder?: string;
  options?: { label: string; value: string; hint?: string }[];
  when?: { key: string; op: string; value: string };
};

export type AuthMethod = {
  type: "oauth" | "api";
  label: string;
  prompts?: AuthPrompt[];
};

export type AgentCatalogProvider = {
  id: string;
  name: string;
  env: string[];
  api?: string;
  npm?: string;
  connected: boolean;
  authMethods: AuthMethod[];
  models: CatalogModel[];
};

export type AgentConfigData = {
  freeModels: AgentFreeModel[];
  providerGroups: AgentProviderGroup[];
  defaultProviderId: string;
  defaultModelId: string;
};

export type KvEntry = {
  key: string;
  value: string;  // JSON-serialized value
  updatedAt: number;
};

export type AppInfo = {
  name: string;
  version: string;
  electron: string;
  chromium: string;
  node: string;
  v8: string;
  os: string;
};

export type DevtoolAPI = {
  app: {
    getInfo: () => Promise<AppInfo>;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    openDevTools: () => void;
    enterMain: () => void;
    enterWelcome: () => void;
  };
  theme: {
    get: () => Promise<"system" | "light" | "dark">;
    set: (theme: "system" | "light" | "dark") => Promise<void>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    showItemInFolder: (path: string) => Promise<void>;
  };
  fileUtils: {
    getPathForFile: (file: File) => string;
  };
  package: {
    openFolder: () => Promise<PackageInfo | null>;
    loadFolder: (dirPath: string) => Promise<PackageInfo>;
    getRecent: () => Promise<string[]>;
    clearRecent: () => Promise<void>;
    onHotReload: (
      cb: (event: { type: "frontend" | "backend" }) => void
    ) => () => void;
    saveManifest: (dir: string, manifest: AppManifest) => Promise<void>;
    onManifestReload: (cb: (manifest: AppManifest) => void) => () => void;
    onWarningsChanged: (cb: (warnings: string[]) => void) => () => void;
    readImage: (appDir: string, relPath: string) => Promise<string | null>;
    saveImageFile: (appDir: string, relPath: string, dataUrl: string) => Promise<void>;
    listImages: (appDir: string, subPath: string) => Promise<string[]>;
    deleteImageFile: (appDir: string, relPath: string) => Promise<void>;
    pickImageFiles: (appDir: string, multi: boolean) => Promise<{ dataUrl: string; filename: string }[]>;
    onAssetsChanged: (cb: (info: { role: "cover" | "carousel" | "logo"; appDir: string; filename: string; relPath: string }) => void) => () => void;
    build: (appDir: string) => Promise<{ outputPath: string } | null>;
  };
  execution: {
    run: (params: RunParams) => Promise<RunResult>;
    cancel: () => Promise<void>;
    isRunning: () => Promise<boolean>;
    onLog: (cb: (entry: LogEntry) => void) => () => void;
    onStatus: (cb: (status: "idle" | "running" | "error") => void) => () => void;
  };
  db: {
    getTables: (dbPath: string) => Promise<string[]>;
    getTableRows: (
      dbPath: string,
      table: string,
      limit: number,
      offset: number
    ) => Promise<{ rows: Record<string, unknown>[]; total: number }>;
    runQuery: (
      dbPath: string,
      sql: string
    ) => Promise<{ columns: string[]; rows: unknown[][] } | { error: string }>;
    exportDb: (dbPath: string) => Promise<string | null>;
  };
  kv: {
    getAllEntries: (dbPath: string) => Promise<KvEntry[]>;
    setEntry: (dbPath: string, key: string, value: string) => Promise<void>;
    deleteEntry: (dbPath: string, key: string) => Promise<void>;
    clearAll: (dbPath: string) => Promise<void>;
    importEntries: (dbPath: string, entries: Array<{ key: string; value: string }>) => Promise<void>;
  };
  server: {
    start: (appDir: string, frontendDir?: string) => Promise<{ url: string; port: number }>;
    stop: () => Promise<void>;
    getUrl: () => Promise<string | null>;
    getLanUrl: () => Promise<string | null>;
  };
  capture: {
    screenshot: (rect?: { x: number; y: number; width: number; height: number }) => Promise<string>;
    getWindowSourceId: () => Promise<string>;
    saveMedia: (params: CaptureParams) => Promise<string>;
    openSaveDialog: (defaultName: string) => Promise<string | null>;
  };
  update: {
    check: () => Promise<void>;
    download: () => Promise<void>;
    install: () => Promise<void>;
    onStatus: (cb: (status: UpdateStatus) => void) => () => void;
  };
  agent: {
    ping: () => Promise<boolean>;
    startServer: () => Promise<{ ok: boolean; error?: string }>;
    setProject: (dir: string) => Promise<void>;
    createSession: (directory?: string) => Promise<AgentSession>;
    listSessions: () => Promise<AgentSession[]>;
    deleteSession: (id: string) => Promise<void>;
    getMessages: (sessionId: string) => Promise<AgentMessage[]>;
    pickFile: () => Promise<FileAttachment[]>;
    sendPrompt: (sessionId: string, text: string, projectDir?: string, mode?: string, files?: FileAttachment[]) => Promise<void>;
    abortSession: (sessionId: string) => Promise<void>;
    listProviders: () => Promise<AgentProvider[]>;
    getConfig: () => Promise<AgentConfigData>;
    setApiKey: (providerId: string, key: string) => Promise<void>;
    setProviderConfig: (providerId: string, config: { type: "api" | "oauth"; key?: string; options?: Record<string, string> }) => Promise<void>;
    listCatalogProviders: () => Promise<AgentCatalogProvider[]>;
    getPrefs: () => Promise<AgentPrefs>;
    setPrefs: (prefs: Partial<AgentPrefs>) => Promise<void>;
    subscribe: () => Promise<void>;
    unsubscribe: () => Promise<void>;
    onEvent: (cb: (event: AgentEvent) => void) => () => void;
    answerQuestion: (answers: string[][]) => Promise<void>;
    onQuestion: (cb: (data: {
      id: string;
      sessionID: string;
      questions: Array<{
        header: string;
        question: string;
        options: Array<{ label: string; description: string }>;
        multiple?: boolean;
        custom?: boolean;
      }>;
    }) => void) => () => void;
  };
  git: {
    init: (projectDir: string) => Promise<string>;
    commit: (projectDir: string, message: string) => Promise<string>;
    log: (projectDir: string, depth?: number, branch?: string) => Promise<GitCommitInfo[]>;
    graph: (projectDir: string) => Promise<GitGraphData>;
    status: (projectDir: string) => Promise<GitStatusEntry[]>;
    listBranches: (projectDir: string) => Promise<GitBranchInfo[]>;
    createBranch: (projectDir: string, branchName: string) => Promise<void>;
    switchBranch: (projectDir: string, branchName: string) => Promise<void>;
    currentBranch: (projectDir: string) => Promise<string>;
    diff: (projectDir: string, oid1?: string, oid2?: string) => Promise<GitDiffEntry[]>;
    revertFile: (projectDir: string, filepath: string) => Promise<void>;
    resetToCommit: (projectDir: string, oid: string) => Promise<void>;
    autoCommit: (projectDir: string, taskId: string, summary: string) => Promise<AutoCommitResult | null>;
  };
  checkpoint: {
    createTask: (sessionId: string, projectDir: string, title?: string) => Promise<TaskRow>;
    updateTaskStatus: (id: string, status: "running" | "completed" | "error") => Promise<void>;
    getTask: (id: string) => Promise<TaskRow | undefined>;
    listTasks: (projectDir: string) => Promise<TaskRow[]>;
    deleteTask: (id: string) => Promise<void>;
    listCheckpoints: (taskId: string) => Promise<CheckpointRow[]>;
    getTaskWithCheckpoints: (taskId: string) => Promise<TaskWithCheckpoints | undefined>;
    listTasksWithCheckpoints: (projectDir: string) => Promise<TaskWithCheckpoints[]>;
  };
  extensions: {
    list: () => Promise<VSCodeExtension[]>;
    installFromDialog: () => Promise<VSCodeExtension | null>;
    install: (vsixPath: string) => Promise<VSCodeExtension>;
    uninstall: (extensionId: string) => Promise<void>;
    setEnabled: (extensionId: string, enabled: boolean) => Promise<void>;
    getIcon: (extensionId: string) => Promise<string | null>;
  };
};

// ── Git types ──────────────────────────────────────────────────────

export type GitCommitInfo = {
  oid: string;
  shortOid: string;
  message: string;
  author: { name: string; email: string };
  committedAt: number;
  parentOids: string[];
};

export type GitBranchInfo = {
  name: string;
  isCurrent: boolean;
  tipOid: string;
};

export type GitStatusEntry = {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
};

export type GitDiffEntry = {
  path: string;
  oldOid?: string;
  newOid?: string;
  changeType: "added" | "modified" | "deleted";
};

export type AutoCommitResult = {
  oid: string;
  shortOid: string;
  message: string;
  fileCount: number;
  files: string[];
};

// ── Checkpoint types ──────────────────────────────────────────────

export type GitGraphData = {
  commits: GitCommitInfo[];
  branches: { name: string; tipOid: string; isCurrent: boolean }[];
};

export type TaskRow = {
  id: string;
  session_id: string;
  project_dir: string;
  title: string;
  status: string;
  created_at: number;
  updated_at: number;
};

export type CheckpointRow = {
  id: string;
  task_id: string;
  commit_oid: string;
  branch: string;
  summary: string;
  file_count: number;
  created_at: number;
};

export type TaskWithCheckpoints = TaskRow & { checkpoints: CheckpointRow[] };

// ── Extension types ──────────────────────────────────────────────

export type VSCodeExtension = {
  id: string;
  name: string;
  displayName: string;
  version: string;
  publisher: string;
  description: string;
  icon?: string;
  categories?: string[];
  engines?: { vscode: string };
  main?: string;
  contributes?: Record<string, unknown>;
  enabled: boolean;
  installedPath: string;
  extensionDir: string;
  activationEvents?: string[];
};

declare global {
  interface Window {
    devtool: DevtoolAPI;
  }
}
