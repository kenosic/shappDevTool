import { ipcMain, safeStorage, BrowserWindow, dialog, app } from "electron";
import { createServer } from "net";
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from "fs";
import { pathToFileURL } from "url";
import * as path from "path";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { Session, Message, Part } from "@opencode-ai/sdk";
import { getStore } from "../main";

// ── Diagnostics logger (writes to userData/logs/agent.log) ───────

let _logPath: string | null = null;
function agentLog(msg: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  if (!_logPath) {
    try {
      const dir = path.join(app.getPath("userData"), "logs");
      mkdirSync(dir, { recursive: true });
      _logPath = path.join(dir, "agent.log");
    } catch { return; }
  }
  try { appendFileSync(_logPath, line + "\n", "utf-8"); } catch { /* ignore */ }
}

// ── Types ────────────────────────────────────────────────────────

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

// Model metadata types (aligns with opencode SDK)
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

// Full catalog entry from models.dev (popular providers, including not-yet-configured)
export type AgentCatalogProvider = {
  id: string;
  name: string;
  env: string[];               // required env var names (config template)
  api?: string;                // API base URL
  npm?: string;                // SDK package name
  connected: boolean;          // whether auth is already configured
  authMethods: AuthMethod[];
  models: CatalogModel[];
};

export type AgentEvent =
  | { type: "message.part"; sessionId: string; messageId: string; part: AgentMessagePart }
  | { type: "message.completed"; sessionId: string; message: AgentMessage }
  | { type: "session.updated"; session: AgentSession }
  | { type: "error"; sessionId?: string; message: string };

// ── State ─────────────────────────────────────────────────────────

type AgentInstance = {
  server: { url: string; close(): void };
  client: ReturnType<typeof createOpencodeClient>;
};

let _instance: AgentInstance | null = null;
let _startPromise: Promise<{ ok: boolean; error?: string }> | null = null;
let _eventAbort: AbortController | null = null;
let _controlAbort: AbortController | null = null;
let _pendingQuestionResolve: ((answers: string[][]) => void) | null = null;
let _pendingQuestionReject: ((err: Error) => void) | null = null;
let _pendingQuestionId: string | null = null;       // requestID from question.asked SSE event
let _mainWindow: BrowserWindow | null = null;
let _currentProjectDir: string | null = null;

function getClient() {
  if (!_instance) throw new Error("OpenCode server not started");
  return _instance.client;
}

/**
 * Returns the directory that should be passed to opencode as OPENCODE_CONFIG_DIR
 * so that the mars-app-generator skill (and any other skills under .github/skills/)
 * are discovered automatically.  Two modes:
 *   - Dev / source build : __dirname is out/main (or dist-dev/main), so "../../.github"
 *     resolves to this project root's D:\code\Shapp\src\devTool\.github.
 *   - Packaged app       : skills are bundled into resources/github-config via
 *     electron-builder extraResources, so we point at process.resourcesPath.
 */
function getSkillsConfigDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "github-config")
    : path.join(__dirname, "../../.github");
}

/** Ensure a correctly-named opencode binary is available in a writable location
 *  and return its directory so it can be injected into PATH.
 *
 *  The bundled binary uses a platform-suffixed name (e.g. opencode-win32-x64.exe)
 *  but @opencode-ai/sdk internally runs `launch("opencode", ...)` — on Windows
 *  cross-spawn resolves the bare name via PATHEXT, so the file must be named
 *  opencode.exe / opencode.cmd.  We create a thin wrapper script (not a 140 MB
 *  copy of the binary) in a writable location.
 *
 *  Two lookup strategies:
 *   - Packaged app  : process.resourcesPath + opencode/
 *   - Dev / source  : __dirname + ../../resources/opencode/
 */
function ensureOpencodeWrapperDir(): string | null {
  const bundledDir = app.isPackaged
    ? path.join(process.resourcesPath, "opencode")
    : path.join(__dirname, "../../resources/opencode");

  agentLog(`ensureOpencodeWrapperDir: packaged=${app.isPackaged}, bundledDir=${bundledDir}, exists=${existsSync(bundledDir)}`);
  if (!existsSync(bundledDir)) return null;

  const wrapperDir = app.isPackaged
    ? path.join(app.getPath("userData"), "opencode-wrapper")
    : path.join(__dirname, "../../../node_modules/.cache/opencode-wrapper");
  mkdirSync(wrapperDir, { recursive: true });

  if (process.platform === "win32") {
    const src = path.join(bundledDir, "opencode-win32-x64.exe");
    const dst = path.join(wrapperDir, "opencode.cmd");
    agentLog(`ensureOpencodeWrapperDir: win32 src=${src}, srcExists=${existsSync(src)}, dst=${dst}, dstExists=${existsSync(dst)}`);
    if (existsSync(src) && !existsSync(dst)) {
      writeFileSync(dst, `@"${src}" %*\r\n`, "utf-8");
      agentLog(`ensureOpencodeWrapperDir: created wrapper cmd`);
    }
  } else {
    // macOS / Linux — the bundled binary has no extension
    const candidates = ["opencode-darwin-arm64", "opencode-darwin-x64", "opencode-linux-x64"];
    for (const name of candidates) {
      const src = path.join(bundledDir, name);
      if (existsSync(src)) {
        const dst = path.join(wrapperDir, "opencode");
        if (!existsSync(dst)) {
          writeFileSync(dst, `#!/bin/sh\nexec "${src}" "$@"\n`, { mode: 0o755 });
        }
        break;
      }
    }
  }

  return wrapperDir;
}

/** Spawn the OpenCode server with `cwd` set to the project directory so that
 *  all tool calls (read, glob, etc.) operate relative to the opened project.
 *
 *  We use `createOpencode` from the SDK (which internally uses cross-spawn and
 *  handles Windows PATH resolution) rather than a raw child_process.spawn.
 *  To control the cwd we temporarily change process.cwd() right before calling
 *  it — this is safe because JavaScript is single-threaded: the spawn call
 *  inside the SDK is synchronous, so we can restore the cwd immediately after
 *  the call returns (before the first async yield).
 *
 *  The same synchronous window is used to set OPENCODE_CONFIG_DIR and inject
 *  the opencode wrapper directory into PATH so that the spawned opencode child
 *  process can discover both the bundled skills and the bundled binary.
 */
async function spawnOpenCodeServer(port: number, cwd: string): Promise<AgentInstance> {
  agentLog(`spawnOpenCodeServer: port=${port}, cwd=${cwd}`);
  const skillsConfigDir = getSkillsConfigDir();
  const savedConfigDir = process.env.OPENCODE_CONFIG_DIR;
  if (existsSync(skillsConfigDir)) {
    process.env.OPENCODE_CONFIG_DIR = skillsConfigDir;
    agentLog(`spawnOpenCodeServer: OPENCODE_CONFIG_DIR=${skillsConfigDir}`);
  } else {
    agentLog(`spawnOpenCodeServer: skillsConfigDir NOT found: ${skillsConfigDir}`);
  }

  // Ensure the bundled opencode binary is discoverable via PATH — in both
  // dev and packaged builds the binary uses a platform-suffixed name that the
  // SDK's bare `launch("opencode")` call cannot resolve directly.
  const savedPath = process.env.PATH;
  const wrapperDir = ensureOpencodeWrapperDir();
  if (wrapperDir) {
    process.env.PATH = `${wrapperDir}${path.delimiter}${savedPath ?? ""}`;
    agentLog(`spawnOpenCodeServer: PATH prepended with ${wrapperDir}`);
  } else {
    agentLog(`spawnOpenCodeServer: NO wrapper dir — relying on system PATH`);
  }

  const savedCwd = process.cwd();
  process.chdir(cwd);
  // createOpencode() is async, but its internal `launch("opencode", ...)` call
  // is *synchronous* — the child process is spawned before the first await.
  // We must call it and restore cwd / env in the same synchronous turn.
  // The child already captured the env snapshot at spawn time, so restoring
  // early is safe.
  const raw = createOpencode({
    hostname: "127.0.0.1",
    port,
    timeout: 15000,
    config: {
      agent: {
        build: { permission: { external_directory: "deny" } },
        plan: { permission: { external_directory: "deny" } },
        general: { permission: { external_directory: "deny" } },
      },
    },
  });
  process.chdir(savedCwd);

  // Restore PATH
  if (savedPath !== undefined) {
    process.env.PATH = savedPath;
  } else {
    delete process.env.PATH;
  }

  if (savedConfigDir !== undefined) {
    process.env.OPENCODE_CONFIG_DIR = savedConfigDir;
  } else {
    delete process.env.OPENCODE_CONFIG_DIR;
  }

  const resolved = await raw;
  agentLog(`spawnOpenCodeServer: server ready at ${resolved.server.url}`);
  // Build a directory-aware client so GET /session automatically filters by
  // this project and the x-opencode-directory header is sent on all requests.
  const client = createOpencodeClient({ baseUrl: resolved.server.url, directory: cwd });
  return { server: resolved.server, client };
}

/** Ask the OS for a free ephemeral port (avoids Windows excluded ranges like 4001-4100). */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// ── Store helpers ─────────────────────────────────────────────────

/** Keep real opencode-generated titles; convert the default timestamp format to empty string
 *  so the renderer can show the content-based auto-title from the first user message.
 */
function normalizeTitle(title: string | undefined | null): string {
  if (!title) return "";
  if (/^New session\s*[-\u2013]\s*\d{4}-\d{2}-\d{2}/i.test(title)) return "";
  return title;
}

// ── Context injection ────────────────────────────────────────────

/**
 * Build and send the system context message for a new session.
 * Uses promptAsync with noReply=true so the agent receives the instructions
 * but does not generate a response.  The message is filtered from the
 * renderer display by getMessages (checks for "当前项目目录:" prefix).
 */
async function injectSessionContext(
  client: ReturnType<typeof createOpencodeClient>,
  sessionId: string,
  projectDir?: string,
) {
  const dir = projectDir ?? _currentProjectDir ?? process.cwd();

  const contextLines = [
    `当前项目目录: ${dir}`,
    "",
    "## 重要说明（请严格遵守）",
    "",
    "### 1. 主动使用 Skill",
    `你当前可以访问以下 Skill（位于 OPENCODE_CONFIG_DIR/skills/ 目录下）：`,
    "- `mars-app-generator` — 生成 MARS 应用类微应用（WebView 前端 + TypeScript 后端）",
    "- `mars-cocos-game-generator` — 生成 Cocos Creator 游戏类微应用",
    "- `mars-unity-game-generator` — 生成 Unity 游戏类微应用",
    "",
    "当用户请求创建 MARS 应用或游戏时，**必须主动读取并使用对应的 Skill 文件**。",
    "Skill 文件中包含了完整的协议规范、SDK API 用法、权限模型和打包约定。",
    "**不要凭记忆生成 MARS 应用代码**，始终以 Skill 文件中的规范为准。",
    "",
    "### 2. 文件直接放在当前项目目录",
    `**所有生成的应用文件必须直接放在当前项目目录中：\`${dir}\`**`,
    "- ❌ 不要创建新的子目录（如 `my-app/`, `todo-app/` 等）",
    "- ✅ 直接在当前目录下创建 `manifest.json`、`permissions.json`、`frontend/index.html`、`backend/main.ts` 等文件",
    "- 如果当前目录已有文件，先了解现有结构再决定如何修改",
    "- 善用 `list_dir`、`read_file` 等工具了解当前目录结构",
    "",
    "### 3. 其他注意事项",
    "- 使用 `manage_todo_list` 规划复杂任务",
    "- 后端代码必须使用 `@mars/sdk` 而非 `@mars/sdk/common`",
    "- 数据库操作前必须先 `CREATE TABLE IF NOT EXISTS`",
    "- 每个 ZIP 包文件数上限 2000，避免生成大量独立数据文件",
  ];

  const contextText = contextLines.join("\n");
  agentLog(`injectSessionContext: sending context to ${sessionId}, len=${contextText.length}`);

  await client.session.promptAsync({
    path: { id: sessionId },
    body: {
      noReply: true,
      parts: [{ type: "text", text: contextText }],
    },
  });

  agentLog(`injectSessionContext: done for ${sessionId}`);
}

const AGENT_STORE_KEY = "agentPanel" as const;

type AgentStoreData = {
  width: number;
  visible: boolean;
  selectedProvider: string;
  selectedModel: string;
  mode: "build" | "plan";
  encryptedKeys: Record<string, string>;
};

const AGENT_DEFAULTS: AgentStoreData = {
  width: 360,
  visible: true,
  selectedProvider: "",
  selectedModel: "",
  mode: "build",
  encryptedKeys: {},
};

function getAgentStore(): AgentStoreData {
  const store = getStore();
  return (store.get(AGENT_STORE_KEY as any) as AgentStoreData) ?? AGENT_DEFAULTS;
}

function setAgentStore(data: Partial<AgentStoreData>) {
  const store = getStore();
  const current = getAgentStore();
  store.set(AGENT_STORE_KEY as any, { ...current, ...data });
}

// ── TUI control polling (question tool support) ──────────────────────

/**
 * Poll /tui/control/next in a loop so the server can forward interactive
 * requests (e.g. the `question` built-in tool) to the renderer.
 * When a question arrives the loop pauses and waits for the renderer to
 * supply answers via the `agent:answerQuestion` IPC call, then submits
 * them with /tui/control/response before resuming the next poll cycle.
 */
function startControlPolling(win: BrowserWindow) {
  console.log("[ControlPoll] start, dir =", _currentProjectDir);
  if (_controlAbort) _controlAbort.abort();
  _controlAbort = new AbortController();
  const signal = _controlAbort.signal;

  (async () => {
    while (!signal.aborted) {
      try {
        const client = getClient();
        console.log("[ControlPoll] calling tui.control.next()");
        const result = await client.tui.control.next(
          _currentProjectDir ? { query: { directory: _currentProjectDir } } : {}
        );
        if (signal.aborted) break;

        console.log("[ControlPoll] next() returned, error:", (result as any).error, "data keys:", result.data ? Object.keys(result.data as object) : null);

        const data = result.data as { path: string; body: unknown } | null;
        if (!data) {
          console.log("[ControlPoll] no data, retrying after 500ms");
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        // Identify question requests by the presence of a `questions` array
        const body = data.body as Record<string, unknown> | null;
        console.log("[ControlPoll] path:", (data as any).path, "body type:", typeof body, "has questions:", body && Array.isArray(body.questions));

        if (body && Array.isArray(body.questions)) {
          // Reject any previously stale pending question
          _pendingQuestionReject?.(new Error("superseded"));
          _pendingQuestionResolve = null;
          _pendingQuestionReject = null;

          console.log("[ControlPoll] question received, questions count:", (body.questions as unknown[]).length, "sending to renderer");
          if (!win.isDestroyed()) {
            win.webContents.send("agent:question", body);
          }

          // Await user answer — resolved by agent:answerQuestion IPC
          console.log("[ControlPoll] waiting for user answer...");
          const answers = await new Promise<string[][]>((resolve, reject) => {
            _pendingQuestionResolve = resolve;
            _pendingQuestionReject = reject;
          });
          _pendingQuestionResolve = null;
          _pendingQuestionReject = null;

          console.log("[ControlPoll] got answers:", JSON.stringify(answers).slice(0, 300));
          if (!signal.aborted) {
            console.log("[ControlPoll] calling tui.control.response()");
            const resp = await getClient().tui.control.response({
              body: { answers },
              ..._currentProjectDir ? { query: { directory: _currentProjectDir } } : {},
            });
            console.log("[ControlPoll] response() result, error:", (resp as any).error, "data:", resp.data);
          } else {
            console.warn("[ControlPoll] signal aborted before response, answers NOT submitted");
          }
        } else {
          console.log("[ControlPoll] non-question control body, continuing loop");
        }
      } catch (err) {
        if (signal.aborted) break;
        console.error("[ControlPoll] error in loop:", err);
        // Brief back-off on transient errors (server restart, network blip)
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    console.log("[ControlPoll] loop exited, aborted =", signal.aborted);
  })().catch((err) => console.error("[ControlPoll] fatal:", err));
}

// ── SSE Event subscription ─────────────────────────────────────────

async function startEventSubscription(win: BrowserWindow) {
  agentLog(`startEventSubscription: starting, serverUrl=${_instance?.server.url}`);
  if (_eventAbort) {
    _eventAbort.abort();
    agentLog(`startEventSubscription: aborted previous subscription`);
  }
  _eventAbort = new AbortController();
  const client = getClient();

  try {
    const response = await client.event.subscribe();
    agentLog(`startEventSubscription: SSE connected, entering event loop`);
    let eventCount = 0;
    for await (const event of response.stream) {
      if (_eventAbort?.signal.aborted) break;
      eventCount++;
      const e = event as any;
      // Log every 50th event + key types to avoid flooding
      if (eventCount % 50 === 0 || e?.type === "session.error" || e?.type === "session.idle") {
        agentLog(`SSE event #${eventCount}: type=${e?.type}, props=${JSON.stringify(e?.properties).slice(0, 200)}`);
      }

      // Auto-approve any permission requests so tools are never blocked
      if (e?.type === "permission.asked") {
        const { id: permissionID, sessionID } = e.properties ?? {};
        if (permissionID && sessionID) {
          client.postSessionIdPermissionsPermissionId({
            path: { id: sessionID, permissionID },
            body: { response: "always" },
          }).catch((err: unknown) => {
            console.warn("[Agent] Failed to approve permission:", permissionID, err);
          });
        }
        // Don't forward to renderer — this is an internal handshake
        continue;
      }

      // Forward question.asked as agent:question so the renderer can show the
      // questionnaire UI even if the control-poll loop missed the request.
      if (e?.type === "question.asked") {
        _pendingQuestionId = e.properties?.id ?? null;
        console.log("[Agent][SSE] question.asked, stored requestID:", _pendingQuestionId);
        if (!win.isDestroyed()) {
          win.webContents.send("agent:question", e.properties);
        }
        // Still forward as agent:event so the store can update pendingQuestion
      }

      // Clear the pending question ID when the question is resolved
      if (e?.type === "question.replied" || e?.type === "question.rejected") {
        console.log("[Agent][SSE]", e.type, ", clearing pendingQuestionId");
        _pendingQuestionId = null;
      }

      if (!win.isDestroyed()) {
        win.webContents.send("agent:event", event);
      }
    }
  } catch (err) {
    if (!_eventAbort?.signal.aborted) {
      agentLog(`startEventSubscription: SSE error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ── MIME type helper ─────────────────────────────────────────────

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    txt: "text/plain", md: "text/markdown", json: "application/json",
    ts: "text/plain", tsx: "text/plain", js: "text/plain", jsx: "text/plain",
    css: "text/css", html: "text/html", xml: "text/xml",
    py: "text/plain", rs: "text/plain", go: "text/plain",
    java: "text/plain", c: "text/plain", cpp: "text/plain", h: "text/plain",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    pdf: "application/pdf",
  };
  return map[ext] ?? "text/plain";
}

// ── Register IPC handlers ─────────────────────────────────────────

export function registerAgentHandlers(win: BrowserWindow) {
  _mainWindow = win;

  // Start (or confirm already-running) OpenCode server
  ipcMain.handle("agent:startServer", async () => {
    agentLog(`agent:startServer called, existing instance=${!!_instance}, startPromise=${!!_startPromise}`);
    if (_instance) return { ok: true };
    if (!_startPromise) {
      _startPromise = (async () => {
        try {
          const port = await findFreePort();
          const cwd = _currentProjectDir ?? process.cwd();
          agentLog(`agent:startServer: spawning on port ${port}, cwd=${cwd}`);
          _instance = await spawnOpenCodeServer(port, cwd);
          agentLog(`agent:startServer: server ready at ${_instance.server.url}, cwd=${cwd}`);
          return { ok: true } as const;
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          agentLog(`agent:startServer: FAILED — ${error}`);
          return { ok: false, error } as const;
        } finally {
          _startPromise = null;
        }
      })();
    }
    return _startPromise;
  });

  // Restart OpenCode server with the newly opened project directory.
  // Called whenever the user opens a different project folder.
  ipcMain.handle("agent:setProject", async (_e, dir: string) => {
    if (!dir || typeof dir !== "string") return;
    if (_currentProjectDir === dir && _instance) return;  // already correct
    _currentProjectDir = dir;

    // Server not yet started — it will pick up the dir on first startServer call.
    if (!_instance) return;

    // Restart with the new project directory.
    _eventAbort?.abort();
    _eventAbort = null;

    const oldInstance = _instance;
    _instance = null;
    _startPromise = null;
    setTimeout(() => oldInstance.server.close(), 500);  // graceful async close

    try {
      const port = await findFreePort();
      _instance = await spawnOpenCodeServer(port, dir);
      console.log("[Agent] OpenCode restarted for project:", dir, "at", _instance.server.url);
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        startEventSubscription(_mainWindow);
        startControlPolling(_mainWindow);
      }
    } catch (err: unknown) {
      console.error("[Agent] Failed to restart OpenCode for project:", err);
    }
  });

  // Ping — lightweight reachability check (server already started)
  ipcMain.handle("agent:ping", async () => {
    try {
      const client = getClient();
      const result = await client.session.list();
      return result.error == null;
    } catch {
      return false;
    }
  });

  // Create a new session — pass optional working directory so the agent knows the project context
  ipcMain.handle("agent:createSession", async (_e, directory?: string) => {
    const client = getClient();
    const opts: Parameters<typeof client.session.create>[0] = {};
    if (directory && typeof directory === "string") opts.query = { directory };
    const result = await client.session.create(opts);
    if ((result as any).error) throw new Error(String((result as any).error));
    const s = result.data as Session;

    // ── Inject context / system prompt ──────────────────────────
    // Send a noReply message that primes the agent with:
    //   1. The project directory (so the agent knows where it is)
    //   2. Instructions to actively use available skills
    //   3. Instructions to create files directly in the project root, not a subdirectory
    injectSessionContext(client, s.id, directory).catch((err) => {
      agentLog(`injectSessionContext failed for ${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    });

    return { id: s.id, title: normalizeTitle(s.title), createdAt: s.time?.created ?? Date.now() } satisfies AgentSession;
  });

  // List sessions
  ipcMain.handle("agent:listSessions", async () => {
    try {
      const client = getClient();
      const result = await client.session.list();
      if (result.error) return [];
      const sessions = (result.data as Session[]) ?? [];
      return sessions.map((s): AgentSession => ({
        id: s.id,
        title: normalizeTitle(s.title),
        createdAt: s.time?.created ?? Date.now(),
      }));
    } catch {
      return [];
    }
  });

  // Delete session
  ipcMain.handle("agent:deleteSession", async (_e, id: string) => {
    if (!id || typeof id !== "string") throw new Error("Invalid session id");
    const client = getClient();
    await client.session.delete({ path: { id } });
  });

  // Get messages for a session
  ipcMain.handle("agent:getMessages", async (_e, sessionId: string) => {
    if (!sessionId || typeof sessionId !== "string") return [];
    try {
      const client = getClient();
      const result = await client.session.messages({ path: { id: sessionId } });
      if (result.error) return [];
      const raw = (result.data as Array<{ info: Message; parts: Part[] }>) ?? [];
      const mapped = raw.map((item): AgentMessage => ({
        id: item.info.id,
        role: item.info.role as "user" | "assistant",
        parts: (item.parts ?? []).flatMap((p: Part): AgentMessagePart[] => {
          if (p.type === "text") return [{ type: "text", text: (p as any).text ?? "" }];
          if (p.type === "tool") {
            const state = (p as any).state as any;
            return [{
              type: "tool",
              callID: (p as any).callID ?? (p as any).id ?? "",
              toolName: (p as any).tool ?? "",
              args: state?.input ?? {},
              result: state?.output ?? state?.error,
              status: state?.status ?? "pending",
            }];
          }
          if (p.type === "file") {
            return [{
              type: "file",
              mimeType: (p as any).mimeType ?? (p as any).mime ?? "",
              url: (p as any).url ?? "",
              filename: (p as any).filename ?? (p as any).name ?? "",
            }];
          }
          // Skip non-renderable part types (step-start, step-finish, snapshot, etc.)
          return [];
        }),
        createdAt: (item.info as any).time?.created ?? Date.now(),
      }));
      // Filter out context-injection messages (noReply messages we sent ourselves)
      return mapped.filter((msg) => {
        if (msg.role !== "user") return true;
        const text = msg.parts.filter((p) => p.type === "text").map((p) => (p as any).text ?? "").join("");
        return !text.startsWith("\u5f53\u524d\u9879\u76ee\u76ee\u5f55:");
      });
    } catch {
      return [];
    }
  });

  // Pick files for attachment
  ipcMain.handle("agent:pickFile", async () => {
    const win = _mainWindow;
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      title: "选择附件",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "代码 / 文本", extensions: ["ts", "tsx", "js", "jsx", "json", "md", "txt", "css", "html", "py", "rs", "go", "java", "c", "cpp", "h"] },
        { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths.map((filePath) => ({
      name: path.basename(filePath),
      mime: getMimeType(path.extname(filePath).toLowerCase().slice(1)),
      url: pathToFileURL(filePath).href,
    }));
  });

  // Send prompt (non-streaming trigger; streaming arrives via agent:event)
  ipcMain.handle("agent:sendPrompt", async (_e, sessionId: string, text: string, projectDir?: string, mode?: string, files?: { name: string; mime: string; url: string }[]) => {
    if (!sessionId || typeof sessionId !== "string") throw new Error("Invalid session id");
    if (typeof text !== "string" || text.trim() === "") throw new Error("Empty message");
    const client = getClient();
    const agentData = getAgentStore();
    agentLog(`sendPrompt: sessionId=${sessionId}, provider=${agentData.selectedProvider}, model=${agentData.selectedModel}, mode=${mode}, textLen=${text.length}, serverUrl=${_instance?.server.url}`);

    const fileParts = (files ?? []).map((f) => ({
      type: "file" as const,
      mime: f.mime,
      url: f.url,
      filename: f.name,
    }));

    // Send prompt — promptAsync returns 204 immediately; streaming arrives via SSE events.
    client.session.promptAsync({
      path: { id: sessionId },
      body: {
        model: {
          providerID: agentData.selectedProvider,
          modelID: agentData.selectedModel,
        },
        ...(mode ? { agent: mode } : {}),
        parts: [...fileParts, { type: "text", text }],
      },
    }).then((result: any) => {
      agentLog(`sendPrompt: response received, ok=${!result?.error}, error=${JSON.stringify(result?.error)}`);
      if (result?.error) {
        if (!win.isDestroyed()) {
          win.webContents.send("agent:event", {
            type: "session.error",
            properties: { sessionID: sessionId, error: { name: "PromptError", data: { message: typeof result.error === "string" ? result.error : JSON.stringify(result.error) } } },
          });
        }
      }
    }).catch((err: Error) => {
      agentLog(`sendPrompt: network/throw error: ${err.message}`);
      if (!win.isDestroyed()) {
        win.webContents.send("agent:event", {
          type: "session.error",
          properties: { sessionID: sessionId, error: { name: "UnknownError", data: { message: err.message } } },
        });
      }
    });
  });

  // Abort a running session
  ipcMain.handle("agent:abortSession", async (_e, sessionId: string) => {
    if (!sessionId || typeof sessionId !== "string") return;
    try {
      const client = getClient();
      await client.session.abort({ path: { id: sessionId } });
    } catch {
      // ignore
    }
  });

  // List providers and models
  ipcMain.handle("agent:listProviders", async () => {
    const client = getClient();
    try {
      const result = await client.config.providers();
      agentLog(`listProviders: result.error=${!!result.error}, data keys=${result.data ? Object.keys(result.data as object).join(",") : "null"}`);
      if (result.error) { agentLog(`listProviders: error detail=${JSON.stringify(result.error)}`); return []; }
      const providers = (result.data as any)?.providers ?? [];
      agentLog(`listProviders: got ${providers.length} providers`);
      return providers.map((p: any): AgentProvider => ({
        id: p.id ?? p.name,
        name: p.name ?? p.id,
        // models is a dict { [modelId]: Model }, not an array
        models: Object.values(p.models ?? {}).map((m: any) => ({
          id: m.id ?? m.providerID,
          name: m.name ?? m.id,
        })),
      }));
    } catch (err: any) {
      agentLog(`listProviders: exception: ${err?.message ?? err}`);
      return [];
    }
  });

  // Get config: free models + provider groups + defaults
  ipcMain.handle("agent:getConfig", async () => {
    try {
      const client = getClient();
      const [cfgResult, provResult] = await Promise.all([
        client.config.get().catch(() => ({ data: null, error: true })),
        client.config.providers().catch(() => ({ data: null, error: true })),
      ]);

      const cfg = (cfgResult as any).data as any;
      const provData = (provResult as any).data as any;
      agentLog(`getConfig: cfg keys=${cfg ? Object.keys(cfg).join(",") : "null"}, provData keys=${provData ? Object.keys(provData).join(",") : "null"}`);
      const rawProviders: any[] = provData?.providers ?? [];
      const defaults: Record<string, string> = provData?.default ?? {};

      // config.model is "providerID/modelID" string, e.g. "anthropic/claude-3-5-sonnet"
      const cfgModel: string = cfg?.model ?? "";
      const [cfgProvider = "", cfgModelId = ""] = cfgModel.includes("/")
        ? cfgModel.split("/")
        : ["", ""];

      const defaultEntries = Object.entries(defaults);
      const defaultProviderId = cfgProvider || (defaultEntries[0]?.[0] ?? "");
      const defaultModelId   = cfgModelId  || (defaultEntries[0]?.[1] ?? "");
      agentLog(`getConfig: cfgModel=${cfgModel}, defaultProviderId=${defaultProviderId}, defaultModelId=${defaultModelId}, defaultEntries=${JSON.stringify(defaultEntries)}`);

      // Collect free models (models with "free" in name or tagged free)
      const freeModels: { id: string; name: string; providerId: string }[] = [];
      const providerGroups: { id: string; name: string; models: { id: string; name: string }[] }[] = [];

      for (const p of rawProviders) {
        const pid = p.id ?? p.name ?? "";
        const pname = p.name ?? p.id ?? "";
        // models is a dict { [modelId]: Model }, not an array
        const models: { id: string; name: string; cost?: { input: number; output: number } }[] =
          Object.values(p.models ?? {}).map((m: any) => ({
            id: m.id,
            name: m.name ?? m.id,
            cost: m.cost,
          }));

        const free = models.filter(
          (m) =>
            (m.cost?.input === 0 && m.cost?.output === 0) ||
            m.name.toLowerCase().includes("free")
        );
        for (const fm of free) {
          freeModels.push({ id: fm.id, name: fm.name, providerId: pid });
        }

        providerGroups.push({
          id: pid,
          name: pname,
          models: models.map((m) => ({ id: m.id, name: m.name })),
        });
      }

      return { freeModels, providerGroups, defaultProviderId, defaultModelId };
    } catch (err: any) {
      agentLog(`getConfig: exception: ${err?.message ?? err}`);
      return { freeModels: [], providerGroups: [], defaultProviderId: "", defaultModelId: "" };
    }
  });

  // Set provider configuration (API key, base URL, and other options)
  ipcMain.handle("agent:setProviderConfig", async (_e, providerId: string, config: { type: "api" | "oauth"; key?: string; options?: Record<string, string> }) => {
    if (!providerId || typeof providerId !== "string") throw new Error("Invalid provider id");
    const client = getClient();

    const body: any = { type: config.type };
    if (config.key) body.key = config.key;
    if (config.options && Object.keys(config.options).length > 0) {
      body.options = config.options;
    }

    await client.auth.set({
      path: { id: providerId },
      body,
    });

    // Persist encrypted key if available
    if (config.key && safeStorage.isEncryptionAvailable()) {
      const agentData = getAgentStore();
      const encryptedKeys = { ...agentData.encryptedKeys };
      encryptedKeys[providerId] = safeStorage.encryptString(config.key).toString("base64");
      setAgentStore({ encryptedKeys });
    }
  });

  // Legacy: set API key only (backward compat)
  ipcMain.handle("agent:setApiKey", async (_e, providerId: string, key: string) => {
    if (!providerId || typeof providerId !== "string") throw new Error("Invalid provider id");
    if (typeof key !== "string") throw new Error("Invalid key");
    const client = getClient();
    await client.auth.set({
      path: { id: providerId },
      body: { type: "api", key },
    });
    // Also persist encrypted
    const agentData = getAgentStore();
    const encryptedKeys = { ...agentData.encryptedKeys };
    if (safeStorage.isEncryptionAvailable()) {
      encryptedKeys[providerId] = safeStorage.encryptString(key).toString("base64");
    }
    setAgentStore({ encryptedKeys });
  });

  // List the full catalog of popular providers (models.dev), with connection status
  ipcMain.handle("agent:listCatalogProviders", async (): Promise<AgentCatalogProvider[]> => {
    try {
      const client = getClient();
      const [listResult, authResult] = await Promise.all([
        client.provider.list().catch(() => ({ data: null, error: true })),
        client.provider.auth().catch(() => ({ data: null, error: true })),
      ]);

      const listData = (listResult as any).data as any;
      const authData = (authResult as any).data as any;
      if (!listData) return [];

      const all: any[] = listData.all ?? [];
      const connected: string[] = listData.connected ?? [];
      const authMap: Record<string, AuthMethod[]> = {};
      if (authData) {
        for (const [key, methods] of Object.entries(authData)) {
          authMap[key] = (methods as any[]).map((m: any) => ({
            type: m.type,
            label: m.label,
            prompts: Array.isArray(m.prompts) ? m.prompts.map((p: any) => ({
              type: p.type,
              key: p.key,
              message: p.message,
              placeholder: p.placeholder,
              options: p.options,
              when: p.when,
            })) : undefined,
          }));
        }
      }

      return all.map((p: any): AgentCatalogProvider => ({
        id: p.id ?? p.name,
        name: p.name ?? p.id,
        env: Array.isArray(p.env) ? p.env : [],
        api: p.api,
        npm: p.npm,
        connected: connected.includes(p.id),
        authMethods: authMap[p.id] ?? [],
        // models is a dict { [modelId]: Model } — include full metadata
        models: Object.values(p.models ?? {}).map((m: any) => ({
          id: m.id,
          name: m.name ?? m.id,
          family: m.family,
          status: m.status ?? "active",
          capabilities: m.capabilities ? {
            temperature: m.capabilities.temperature ?? false,
            reasoning: m.capabilities.reasoning ?? false,
            attachment: m.capabilities.attachment ?? false,
            toolcall: m.capabilities.toolcall ?? false,
            input: {
              text: m.capabilities.input?.text ?? true,
              audio: m.capabilities.input?.audio ?? false,
              image: m.capabilities.input?.image ?? false,
              video: m.capabilities.input?.video ?? false,
              pdf: m.capabilities.input?.pdf ?? false,
            },
            output: {
              text: m.capabilities.output?.text ?? true,
              audio: m.capabilities.output?.audio ?? false,
              image: m.capabilities.output?.image ?? false,
              video: m.capabilities.output?.video ?? false,
              pdf: m.capabilities.output?.pdf ?? false,
            },
          } : undefined,
          cost: m.cost ? {
            input: m.cost.input,
            output: m.cost.output,
            cacheRead: m.cost.cache?.read ?? m.cost.cache_read,
            cacheWrite: m.cost.cache?.write ?? m.cost.cache_write,
          } : undefined,
          limit: m.limit ? {
            context: m.limit.context,
            input: m.limit.input,
            output: m.limit.output,
          } : undefined,
          releaseDate: m.release_date,
          variants: m.variants ? Object.entries(m.variants as Record<string, any>).map(
            ([id, v]: [string, any]) => ({ id, name: v.name ?? id, disabled: v.disabled })
          ) : undefined,
        })),
      }));
    } catch {
      return [];
    }
  });

  // Get/set panel preferences
  ipcMain.handle("agent:getPrefs", () => {
    const { width, visible, selectedProvider, selectedModel, mode } = getAgentStore();
    return { width, visible, selectedProvider, selectedModel, mode };
  });

  ipcMain.handle("agent:setPrefs", (_e, prefs: Partial<Pick<AgentStoreData, "width" | "visible" | "selectedProvider" | "selectedModel" | "mode">>) => {
    setAgentStore(prefs);
  });

  // Answer a pending question from the question tool
  // Uses POST /question/{requestID}/reply — the dedicated question reply endpoint.
  // requestID comes from the question.asked SSE event id stored in _pendingQuestionId.
  ipcMain.handle("agent:answerQuestion", async (_e, answers: string[][]) => {
    console.log("[IPC] agent:answerQuestion, pendingQuestionId =", _pendingQuestionId, "answers:", JSON.stringify(answers).slice(0, 300));
    if (!_pendingQuestionId) {
      console.warn("[IPC] agent:answerQuestion: no pending question ID — cannot submit");
      return;
    }
    if (!_instance) {
      console.warn("[IPC] agent:answerQuestion: no server instance");
      return;
    }
    const requestID = _pendingQuestionId;
    _pendingQuestionId = null;

    const serverBase = _instance.server.url.replace(/\/$/, "");
    const queryStr = _currentProjectDir
      ? `?directory=${encodeURIComponent(_currentProjectDir)}`
      : "";
    const url = `${serverBase}/question/${requestID}/reply${queryStr}`;
    try {
      console.log("[IPC] POST", url);
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      console.log("[IPC] question.reply status:", resp.status, resp.ok);
      if (!resp.ok) {
        const body = await resp.text();
        console.warn("[IPC] question.reply error body:", body);
      }
    } catch (err) {
      console.error("[IPC] question.reply fetch failed:", err);
    }
  });

  // Subscribe to events (starts SSE loop + control polling in parallel)
  ipcMain.handle("agent:subscribe", () => {
    startEventSubscription(win);
    startControlPolling(win);
  });

  // Unsubscribe
  ipcMain.handle("agent:unsubscribe", () => {
    _eventAbort?.abort();
    _eventAbort = null;
  });

  // Diagnostics: return the agent log file path + last 200 lines
  ipcMain.handle("agent:getLog", () => {
    if (!_logPath || !existsSync(_logPath)) return { path: null, tail: "" };
    try {
      const content = readFileSync(_logPath, "utf-8");
      const lines = content.split("\n");
      const tail = lines.slice(-200).join("\n");
      return { path: _logPath, tail };
    } catch {
      return { path: _logPath, tail: "" };
    }
  });
}

export function stopAgentSubscription() {
  _eventAbort?.abort();
  _eventAbort = null;
  _controlAbort?.abort();
  _controlAbort = null;
  _pendingQuestionReject?.(new Error("server stopped"));
  _pendingQuestionResolve = null;
  _pendingQuestionReject = null;
  if (_instance) {
    _instance.server.close();
    _instance = null;
  }
  _currentProjectDir = null;
}
