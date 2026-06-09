import { ipcMain, safeStorage, BrowserWindow, dialog, app } from "electron";
import { createServer } from "net";
import { existsSync } from "fs";
import { pathToFileURL } from "url";
import * as path from "path";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { Session, Message, Part } from "@opencode-ai/sdk";
import { getStore } from "../main";

// ── Types ────────────────────────────────────────────────────────

export type AgentSession = {
  id: string;
  title: string;
  createdAt: number;
};

export type AgentMessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; callID: string; toolName: string; args: Record<string, unknown>; result?: string; status: "pending" | "running" | "completed" | "error" }
  | { type: "file"; mimeType: string; url: string };

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

// Full catalog entry from models.dev (popular providers, including not-yet-configured)
export type AgentCatalogProvider = {
  id: string;
  name: string;
  env: string[];               // required env var names (config template)
  api?: string;                // API base URL
  npm?: string;                // SDK package name
  connected: boolean;          // whether auth is already configured
  authMethods: { type: "oauth" | "api"; label: string }[];
  models: { id: string; name: string }[];
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
 *  The same synchronous window is used to set OPENCODE_CONFIG_DIR so that the
 *  spawned opencode child process inherits the env var and discovers the
 *  mars-app-generator skill (and others) from the monorepo .github directory.
 */
async function spawnOpenCodeServer(port: number, cwd: string): Promise<AgentInstance> {
  const skillsConfigDir = getSkillsConfigDir();
  const savedConfigDir = process.env.OPENCODE_CONFIG_DIR;
  if (existsSync(skillsConfigDir)) {
    process.env.OPENCODE_CONFIG_DIR = skillsConfigDir;
  }

  const savedCwd = process.cwd();
  process.chdir(cwd);
  // createOpencode() is async, but its internal `launch("opencode", ...)` call
  // is *synchronous* — the child process is spawned before the first await.
  // We must call it and restore cwd in the same synchronous turn.
  // OPENCODE_CONFIG_DIR is also restored here: the child already captured the
  // env snapshot at spawn time, so restoring early is safe.
  const raw = createOpencode({ hostname: "127.0.0.1", port, timeout: 15000 });
  process.chdir(savedCwd);
  if (savedConfigDir !== undefined) {
    process.env.OPENCODE_CONFIG_DIR = savedConfigDir;
  } else {
    delete process.env.OPENCODE_CONFIG_DIR;
  }

  const resolved = await raw;
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

/** OpenCode creates sessions with a default title like "New session - 2026-05-27T04:33:24.027Z".
 *  Normalise that back to a plain "New Session" so the renderer can detect when a real title hasn't been set.
 */
function normalizeTitle(title: string | undefined | null): string {
  if (!title) return "New Session";
  if (/^New session\s*[-\u2013]\s*\d{4}-\d{2}-\d{2}/i.test(title)) return "New Session";
  return title;
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
  selectedProvider: "anthropic",
  selectedModel: "claude-opus-4-5",
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
  if (_eventAbort) {
    _eventAbort.abort();
  }
  _eventAbort = new AbortController();
  const client = getClient();

  try {
    const response = await client.event.subscribe();
    for await (const event of response.stream) {
      if (_eventAbort?.signal.aborted) break;
      const e = event as any;
      // DEBUG: log every SSE event so we can inspect the exact shape
      console.log("[Agent][SSE]", JSON.stringify({ type: e?.type, properties: e?.properties }));

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
      console.error("[Agent] Event subscription error:", err);
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
    if (_instance) return { ok: true };
    // Concurrent calls share the same promise — no "already starting" error
    if (!_startPromise) {
      _startPromise = (async () => {
        try {
          const port = await findFreePort();
          const cwd = _currentProjectDir ?? process.cwd();
          _instance = await spawnOpenCodeServer(port, cwd);
          console.log("[Agent] OpenCode server started at", _instance.server.url, "cwd:", cwd);
          return { ok: true } as const;
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          console.error("[Agent] Failed to start OpenCode server:", error);
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
        await startEventSubscription(_mainWindow);
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

    const fileParts = (files ?? []).map((f) => ({
      type: "file" as const,
      mime: f.mime,
      url: f.url,
      filename: f.name,
    }));

    // Send prompt — promptAsync returns 204 immediately; streaming arrives via SSE events
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
    }).catch((err: Error) => {
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
      if (result.error) return [];
      const providers = (result.data as any)?.providers ?? [];
      return providers.map((p: any): AgentProvider => ({
        id: p.id ?? p.name,
        name: p.name ?? p.id,
        // models is a dict { [modelId]: Model }, not an array
        models: Object.values(p.models ?? {}).map((m: any) => ({
          id: m.id ?? m.providerID,
          name: m.name ?? m.id,
        })),
      }));
    } catch {
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
    } catch {
      return { freeModels: [], providerGroups: [], defaultProviderId: "", defaultModelId: "" };
    }
  });

  // Set API key (encrypted)
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
      const authMap: Record<string, { type: "oauth" | "api"; label: string }[]> = authData ?? {};

      return all.map((p: any): AgentCatalogProvider => ({
        id: p.id ?? p.name,
        name: p.name ?? p.id,
        env: Array.isArray(p.env) ? p.env : [],
        api: p.api,
        npm: p.npm,
        connected: connected.includes(p.id),
        authMethods: authMap[p.id] ?? [],
        // models is a dict { [modelId]: Model }
        models: Object.values(p.models ?? {}).map((m: any) => ({
          id: m.id,
          name: m.name ?? m.id,
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

  // Subscribe to events (starts SSE loop + control polling)
  ipcMain.handle("agent:subscribe", async () => {
    await startEventSubscription(win);
    startControlPolling(win);
  });

  // Unsubscribe
  ipcMain.handle("agent:unsubscribe", () => {
    _eventAbort?.abort();
    _eventAbort = null;
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
