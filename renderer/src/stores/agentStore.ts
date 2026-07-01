import { create } from "zustand";
import type { AgentSession, AgentMessage, AgentMessagePart, AgentProvider, AgentEvent, AgentConfigData, AgentCatalogProvider, FileAttachment } from "../types/ipc";
import { usePackageStore } from "./packageStore";
import { useGitStore } from "./gitStore";
import { t } from "../i18n";

// ── Question tool types ──────────────────────────────────────────

export type QuestionOption = { label: string; description: string };
export type QuestionInfo = {
  header: string;
  question: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};
export type PendingQuestion = {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
};

// ── Display message (ordered parts for rendering) ────────────────

/** A single renderable unit within an assistant message. */
export type ContentPart =
  | { kind: "text"; text: string }
  | { kind: "tool"; callID: string; toolName: string; args: Record<string, unknown>; result?: string; status: "pending" | "running" | "completed" | "error" }
  | { kind: "file"; files: FileAttachment[] };

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  /** Parts in the exact order they arrived from the SSE stream. */
  contentParts: ContentPart[];
  isStreaming: boolean;
  createdAt: number;
};

function partsToDisplay(msg: AgentMessage, isStreaming = false): DisplayMessage {
  const contentParts: ContentPart[] = [];
  for (const part of msg.parts) {
    if (part.type === "text") {
      // Merge consecutive text segments
      const last = contentParts[contentParts.length - 1];
      if (last?.kind === "text") {
        last.text += part.text ?? "";
      } else {
        contentParts.push({ kind: "text", text: part.text ?? "" });
      }
    } else if (part.type === "tool") {
      contentParts.push({
        kind: "tool",
        callID: part.callID ?? part.id ?? part.toolName,
        toolName: part.toolName,
        args: part.args,
        result: part.result,
        status: part.status,
      });
    } else if (part.type === "file") {
      // Build FileAttachment from server-stored file part
      const attachment: FileAttachment = {
        name: part.filename ?? part.url.split("/").pop() ?? "file",
        mime: part.mimeType,
        url: part.url,
      };
      // Merge with existing file part in the same message if any
      const lastFile = contentParts.filter((p) => p.kind === "file").pop() as { kind: "file"; files: FileAttachment[] } | undefined;
      if (lastFile) {
        lastFile.files.push(attachment);
      } else {
        contentParts.push({ kind: "file", files: [attachment] });
      }
    }
  }
  return { id: msg.id, role: msg.role, contentParts, isStreaming, createdAt: msg.createdAt };
}

// Module-level map: tracks the real server-assigned user message ID per session.
// Used to filter out user-message echoes from message.part.updated SSE events.
const _knownUserMsgIds: Record<string, string> = {};

// Module-level title cache: persists locally-generated or server-updated titles
// across session reloads and app restarts via localStorage.
// When the server returns the default "New Session" title, we fall back to any
// cached title for that session.
const TITLE_CACHE_KEY = "shapp_devtool_agent_titles";
const RECENT_MODELS_KEY = "shapp_devtool_recent_models";
const MAX_RECENT_MODELS = 10;

function loadRecentModels(): { providerId: string; modelId: string }[] {
  try {
    const raw = localStorage.getItem(RECENT_MODELS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentModels(models: { providerId: string; modelId: string }[]): void {
  try {
    localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(models.slice(0, MAX_RECENT_MODELS)));
  } catch { /* ignore */ }
}

function loadTitleCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TITLE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTitleCache(cache: Record<string, string>): void {
  try {
    localStorage.setItem(TITLE_CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota exceeded — ignore */ }
}

const _titleCache: Record<string, string> = loadTitleCache();

function resolveTitle(sessionId: string, serverTitle: string): string {
  // A real title: non-empty and not the default timestamp format
  const isDefault = !serverTitle
    || /^New session\s*[-\u2013]\s*\d{4}-\d{2}-\d{2}/i.test(serverTitle);
  if (!isDefault) {
    _titleCache[sessionId] = serverTitle;
    saveTitleCache(_titleCache);
    return serverTitle;
  }
  // Fall back to the content-based auto-title cached from the first user message
  return _titleCache[sessionId] || "";
}

// ── Store ─────────────────────────────────────────────────────────

type AgentState = {
  // Sessions
  sessions: AgentSession[];
  activeSessionId: string | null;

  // Messages per session
  messages: Record<string, DisplayMessage[]>;

  // Streaming state
  isStreaming: boolean;
  streamingSessionId: string | null;

  // Panel UI state
  panelVisible: boolean;
  panelWidth: number;

  // Model config
  selectedProvider: string;
  selectedModel: string;
  providers: AgentProvider[];
  configData: AgentConfigData | null;
  catalogProviders: AgentCatalogProvider[];
  catalogLoading: boolean;
  recentModels: { providerId: string; modelId: string }[];
  mode: "build" | "plan";

  // Initialisation
  initialized: boolean;
  serverStatus: "unknown" | "checking" | "ready" | "unreachable";
  serverError: string | null;

  // Question tool interactive state
  pendingQuestion: PendingQuestion | null;

  // Failed query retry state
  lastFailedQuery: { text: string; files?: FileAttachment[] } | null;

  // Actions
  init: () => Promise<void>;
  retryConnection: () => Promise<void>;
  _connectServer: () => Promise<void>;
  createSession: (directory?: string) => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => Promise<void>;
  newSession: () => void;
  sendMessage: (text: string, files?: FileAttachment[]) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  abortStreaming: () => Promise<void>;
  togglePanel: () => void;
  setPanelWidth: (w: number) => void;
  setModel: (provider: string, model: string) => void;
  setMode: (mode: "build" | "plan") => void;
  loadCatalog: () => Promise<void>;
  addProviderKey: (providerId: string, key: string) => Promise<void>;
  setProviderConfig: (providerId: string, config: { type: "api" | "oauth"; key?: string; options?: Record<string, string> }) => Promise<void>;
  handleProjectChange: (dir: string) => Promise<void>;
  answerQuestion: (answers: string[][]) => Promise<void>;
  _handleEvent: (event: AgentEvent) => void;
};

export const useAgentStore = create<AgentState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: {},
  isStreaming: false,
  streamingSessionId: null,
  panelVisible: true,
  panelWidth: 360,
  selectedProvider: "",
  selectedModel: "",
  providers: [],
  configData: null,
  catalogProviders: [],
  catalogLoading: false,
  recentModels: loadRecentModels(),
  mode: "build",
  initialized: false,
  serverStatus: "unknown",
  serverError: null,
  pendingQuestion: null,
  lastFailedQuery: null,

  // ── init ──────────────────────────────────────────────────────────
  init: async () => {
    if (get().initialized) return;

    // Load persisted prefs (local store — always works)
    try {
      const prefs = await window.devtool.agent.getPrefs();
      set({
        panelVisible: prefs.visible ?? true,
        panelWidth: prefs.width,
        selectedProvider: prefs.selectedProvider,
        selectedModel: prefs.selectedModel,
        mode: prefs.mode ?? "build",
      });
    } catch {
      // ignore — use defaults
    }

    set({ initialized: true });

    // Ping server and conditionally load remote data
    await get()._connectServer();
  },

  // ── retryConnection ───────────────────────────────────────────────
  retryConnection: async () => {
    await get()._connectServer();
  },

  // ── _connectServer (internal) ─────────────────────────────────────
  _connectServer: async () => {
    set({ serverStatus: "checking", serverError: null });
    const result = await window.devtool.agent.startServer().catch((e: unknown) => ({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }));
    if (!result.ok) {
      set({ serverStatus: "unreachable", serverError: result.error ?? t("common.unknownError") });
      return;
    }
    set({ serverStatus: "ready", serverError: null });

    // ── Subscribe to SSE events FIRST (before loading data) ────────
    // The SSE stream must be connected before the user sends any message,
    // otherwise server response events are lost.  onEvent / onQuestion
    // are IPC listeners that stick around regardless of subscribe() timing.
    window.devtool.agent.onEvent((event) => get()._handleEvent(event));
    window.devtool.agent.subscribe().catch(() => {});
    window.devtool.agent.onQuestion((questionData) => {
      set({ pendingQuestion: questionData });
    });

    // ── Load sessions / providers / config in parallel ───────────
    // None of these block message sending; the SSE stream is already open.
    try {
      const sessions = (await window.devtool.agent.listSessions()).map((s) => ({
        ...s,
        title: resolveTitle(s.id, s.title),
      }));
      set({ sessions });
    } catch { /* ignore */ }

    try {
      const providers = await window.devtool.agent.listProviders();
      if (providers.length > 0) set({ providers });
    } catch { /* ignore */ }

    try {
      const configData = await window.devtool.agent.getConfig();
      set({ configData });
      // Always use the server's default model, overriding the hardcoded fallback
      if (configData.defaultProviderId && configData.defaultModelId) {
        set({
          selectedProvider: configData.defaultProviderId,
          selectedModel: configData.defaultModelId,
        });
        // Persist to Electron store so agent:sendPrompt reads the correct model
        window.devtool.agent.setPrefs({
          selectedProvider: configData.defaultProviderId,
          selectedModel: configData.defaultModelId,
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  },

  // ── createSession ─────────────────────────────────────────────────
  // ── newSession (lazy — no IPC until first message) ───────────────────
  newSession: () => {
    set({ activeSessionId: null, lastFailedQuery: null });
  },

  // ── createSession ────────────────────────────────────────
  createSession: async (directory?: string) => {
    const session = await window.devtool.agent.createSession(directory);
    const resolved = { ...session, title: resolveTitle(session.id, session.title) };
    set((s) => ({
      sessions: [resolved, ...s.sessions],
      activeSessionId: resolved.id,
      messages: { ...s.messages, [resolved.id]: [] },
    }));
    return resolved.id;
  },

  // ── deleteSession ─────────────────────────────────────────────────
  deleteSession: async (id: string) => {
    await window.devtool.agent.deleteSession(id);
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      const messages = { ...s.messages };
      delete messages[id];
      const activeSessionId =
        s.activeSessionId === id ? (sessions[0]?.id ?? null) : s.activeSessionId;
      return { sessions, messages, activeSessionId };
    });
  },

  // ── setActiveSession ──────────────────────────────────────────────
  setActiveSession: async (id: string) => {
    set({ activeSessionId: id });
    // Load messages if not yet loaded
    if (!get().messages[id]) {
      try {
        const raw = await window.devtool.agent.getMessages(id);
        const display = raw.map((m) => partsToDisplay(m));
        set((s) => ({ messages: { ...s.messages, [id]: display } }));
      } catch {
        // ignore
      }
    }
  },

  // ── sendMessage ───────────────────────────────────────────────────
  sendMessage: async (text: string, files?: FileAttachment[]) => {
    const { activeSessionId, selectedProvider, selectedModel } = get();
    let sessionId = activeSessionId;

    const pkg = usePackageStore.getState().current;
    const projectDir = pkg?.dir;

    // Auto-create session if none active
    if (!sessionId) {
      sessionId = await get().createSession(projectDir);
    }

    // Save query for potential retry (cleared on success in session.idle handler)
    set({ lastFailedQuery: { text, files: files?.length ? files : undefined } });

    // Optimistically add user message
    const userMsg: DisplayMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      contentParts: [
        { kind: "text", text },
        ...(files && files.length > 0 ? [{ kind: "file" as const, files }] : []),
      ],
      isStreaming: false,
      createdAt: Date.now(),
    };
    // Add streaming placeholder for assistant
    const placeholderId = `streaming-${Date.now()}`;
    const placeholder: DisplayMessage = {
      id: placeholderId,
      role: "assistant",
      contentParts: [],
      isStreaming: true,
      createdAt: Date.now() + 1,
    };

    set((s) => ({
      isStreaming: true,
      streamingSessionId: sessionId,
      messages: {
        ...s.messages,
        [sessionId!]: [...(s.messages[sessionId!] ?? []), userMsg, placeholder],
      },
    }));

    // Auto-generate title from the first user message if the session still has the default title
    set((s) => {
      const session = s.sessions.find((sess) => sess.id === sessionId);
      if (!session) return {};
      const isDefault = !session.title
        || /^New session\s*[-\u2013]\s*\d{4}-\d{2}-\d{2}/i.test(session.title);
      if (!isDefault) return {};
      const autoTitle = text.slice(0, 35).trim() + (text.length > 35 ? "\u2026" : "");
      _titleCache[sessionId!] = autoTitle;
      saveTitleCache(_titleCache);
      return {
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId ? { ...sess, title: autoTitle } : sess
        ),
      };
    });

    try {
      await window.devtool.agent.sendPrompt(sessionId, text, projectDir, get().mode, files);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Replace placeholder with error message
      set((s) => ({
        isStreaming: false,
        streamingSessionId: null,
        messages: {
          ...s.messages,
          [sessionId!]: (s.messages[sessionId!] ?? [])
            .filter((m) => m.id !== placeholderId)
            .concat({
              id: `error-${Date.now()}`,
              role: "system",
              contentParts: [{ kind: "text", text: `❌ ${errMsg}` }],
              isStreaming: false,
              createdAt: Date.now(),
            }),
        },
      }));
    }
  },

  // ── abortStreaming ────────────────────────────────────────────────
  abortStreaming: async () => {
    const { streamingSessionId } = get();
    if (streamingSessionId) {
      await window.devtool.agent.abortSession(streamingSessionId).catch(() => {});
    }
    set({ isStreaming: false, streamingSessionId: null, lastFailedQuery: null });
  },

  // ── retryLastMessage ──────────────────────────────────────────────
  retryLastMessage: async () => {
    const { lastFailedQuery, isStreaming, activeSessionId, messages } = get();
    if (!lastFailedQuery || isStreaming) return;

    const sessionId = activeSessionId;
    if (!sessionId) return;

    const { text, files } = lastFailedQuery;
    // Keep lastFailedQuery set so the user can retry again if it fails again;
    // it will be cleared by session.idle on success.
    set({ lastFailedQuery: null });

    // ── Reuse the existing user bubble ──────────────────────────
    // Remove all messages that came after the last user message
    // (the failed assistant response, any error system messages, etc.),
    // then append a fresh streaming placeholder for the retry.
    const currentMsgs = messages[sessionId] ?? [];
    let lastUserIdx = -1;
    for (let i = currentMsgs.length - 1; i >= 0; i--) {
      if (currentMsgs[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    const filtered =
      lastUserIdx >= 0 ? currentMsgs.slice(0, lastUserIdx + 1) : currentMsgs;

    const placeholderId = `streaming-${Date.now()}`;
    const placeholder: DisplayMessage = {
      id: placeholderId,
      role: "assistant",
      contentParts: [],
      isStreaming: true,
      createdAt: Date.now(),
    };

    set((s) => ({
      isStreaming: true,
      streamingSessionId: sessionId,
      lastFailedQuery: { text, files },
      messages: {
        ...s.messages,
        [sessionId!]: [...filtered, placeholder],
      },
    }));

    // ── Re-send the prompt ──────────────────────────────────────
    try {
      const pkg = usePackageStore.getState().current;
      const projectDir = pkg?.dir;
      await window.devtool.agent.sendPrompt(sessionId, text, projectDir, get().mode, files);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      set((s) => ({
        isStreaming: false,
        streamingSessionId: null,
        messages: {
          ...s.messages,
          [sessionId!]: (s.messages[sessionId!] ?? [])
            .filter((m) => m.id !== placeholderId)
            .concat({
              id: `error-${Date.now()}`,
              role: "system",
              contentParts: [{ kind: "text", text: `❌ ${errMsg}` }],
              isStreaming: false,
              createdAt: Date.now(),
            }),
        },
      }));
    }
  },

  // ── togglePanel ───────────────────────────────────────────────────
  togglePanel: () => {
    const visible = !get().panelVisible;
    set({ panelVisible: visible });
    window.devtool.agent.setPrefs({ visible }).catch(() => {});
    // Initialise on first open
    if (visible && !get().initialized) get().init();
  },

  // ── setPanelWidth ─────────────────────────────────────────────────
  setPanelWidth: (w: number) => {
    const clamped = Math.max(280, Math.min(560, w));
    set({ panelWidth: clamped });
    window.devtool.agent.setPrefs({ width: clamped }).catch(() => {});
  },

  // ── setModel ──────────────────────────────────────────────────────
  setModel: (provider: string, model: string) => {
    set({ selectedProvider: provider, selectedModel: model });
    window.devtool.agent.setPrefs({ selectedProvider: provider, selectedModel: model }).catch(() => {});

    // Track recent model usage
    const recent = get().recentModels.filter(
      (r) => !(r.providerId === provider && r.modelId === model)
    );
    const updated = [{ providerId: provider, modelId: model }, ...recent].slice(0, MAX_RECENT_MODELS);
    set({ recentModels: updated });
    saveRecentModels(updated);
  },

  // ── setMode ───────────────────────────────────────────────────────
  setMode: (mode: "build" | "plan") => {
    set({ mode });
    window.devtool.agent.setPrefs({ mode }).catch(() => {});
  },

  // ── Provider catalog ──────────────────────────────────────────────
  loadCatalog: async () => {
    set({ catalogLoading: true });
    try {
      const catalog = await window.devtool.agent.listCatalogProviders();
      set({ catalogProviders: catalog, catalogLoading: false });
    } catch {
      set({ catalogLoading: false });
    }
  },

  addProviderKey: async (providerId: string, key: string) => {
    await window.devtool.agent.setApiKey(providerId, key);
    // Reload config (provider groups / free models) and catalog (connection status).
    try {
      const [configData, catalog] = await Promise.all([
        window.devtool.agent.getConfig(),
        window.devtool.agent.listCatalogProviders(),
      ]);
      set({ configData, catalogProviders: catalog });
    } catch {
      /* ignore */
    }
  },

  setProviderConfig: async (providerId: string, config: { type: "api" | "oauth"; key?: string; options?: Record<string, string> }) => {
    await window.devtool.agent.setProviderConfig(providerId, config);
    // Reload config and catalog
    try {
      const [configData, catalog] = await Promise.all([
        window.devtool.agent.getConfig(),
        window.devtool.agent.listCatalogProviders(),
      ]);
      set({ configData, catalogProviders: catalog });
    } catch {
      /* ignore */
    }
  },

  // ── handleProjectChange ───────────────────────────────────────────
  // Called whenever the user opens a different project folder.
  // Restarts the OpenCode server with the new cwd, then reloads the
  // session list (which is now filtered to that project by OpenCode)
  // and restores the most recent session so the user can continue
  // where they left off.
  handleProjectChange: async (dir: string) => {
    // Tell main process to restart OpenCode with the new project cwd.
    await window.devtool.agent.setProject(dir).catch(() => {});

    // Reset session state — old sessions belong to the previous project.
    set({ sessions: [], activeSessionId: null, messages: {}, isStreaming: false, streamingSessionId: null, pendingQuestion: null, lastFailedQuery: null });

    // Wait briefly for the server to stabilise then reload sessions.
    await new Promise((r) => setTimeout(r, 800));
    try {
      const sessions = (await window.devtool.agent.listSessions()).map((s) => ({
        ...s,
        title: resolveTitle(s.id, s.title),
      }));
      // Restore the most recent session so the conversation continues.
      const lastSessionId = sessions[0]?.id ?? null;
      set({ sessions, activeSessionId: lastSessionId });

      if (lastSessionId) {
        try {
          const raw = await window.devtool.agent.getMessages(lastSessionId);
          const display = raw.map((m) => partsToDisplay(m));
          set((s) => ({ messages: { ...s.messages, [lastSessionId]: display } }));
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  },

  // ── answerQuestion ───────────────────────────────────────────────
  answerQuestion: async (answers: string[][]) => {
    console.log("[AgentStore] answerQuestion called, answers:", JSON.stringify(answers).slice(0, 300));
    set({ pendingQuestion: null });
    try {
      await window.devtool.agent.answerQuestion(answers);
      console.log("[AgentStore] answerQuestion IPC completed successfully");
    } catch (err) {
      console.error("[AgentStore] answerQuestion IPC error:", err);
    }
  },

  // ── _handleEvent (SSE) ────────────────────────────────────────────
  // Real SDK event shape: { type: string, properties: { ... } }
  // Key types:
  //   "message.part.updated" → properties.{ part: Part, delta?: string }
  //   "session.idle"         → properties.{ sessionID: string }
  //   "session.error"        → properties.{ sessionID?: string, error?: ... }
  _handleEvent: (event: AgentEvent) => {
    const raw = event as any;
    const type: string = raw?.type ?? "";
    const props = raw?.properties ?? {};
    // DEBUG: log every event received in renderer
    console.log("[AgentStore][event]", type, JSON.stringify(props));

    if (type === "message.updated") {
      // Establish real message IDs so we can filter user-echo events
      const info = props.info as any;
      if (!info?.id || !info?.sessionID) return;
      if (info.role === "user") {
        _knownUserMsgIds[info.sessionID] = info.id;
      } else if (info.role === "assistant") {
        set((s) => {
          const msgs = s.messages[info.sessionID] ?? [];
          // Skip if already tracked (e.g. a title-update event for an existing message)
          if (msgs.some((m) => m.id === info.id)) return {};

          const streamingIdx = msgs.findIndex((m) => m.isStreaming);
          const updated = [...msgs];

          if (streamingIdx >= 0) {
            const cur = updated[streamingIdx];
            if (cur.id.startsWith("streaming-")) {
              // First OpenCode message in this response: claim the temporary
              // placeholder we created in sendMessage (just update its id).
              updated[streamingIdx] = { ...cur, id: info.id };
            } else {
              // A *subsequent* OpenCode message: finalise the previous display
              // message so it keeps its own contentParts, then open a fresh
              // placeholder for the new message.  This lets mergeAssistantMessages
              // concatenate them in the correct SSE order rather than mixing
              // text from different steps into one contentParts array.
              updated[streamingIdx] = { ...cur, isStreaming: false };
              updated.push({
                id: info.id,
                role: "assistant" as const,
                contentParts: [],
                isStreaming: true,
                createdAt: Date.now(),
              });
            }
          } else {
            // No streaming placeholder — add one for this message
            updated.push({
              id: info.id,
              role: "assistant" as const,
              contentParts: [],
              isStreaming: true,
              createdAt: Date.now(),
            });
          }

          return { messages: { ...s.messages, [info.sessionID]: updated } };
        });
      }

    } else if (type === "message.part.updated") {
      const part = props.part as any;
      if (!part) return;
      const sessionId: string = part.sessionID ?? "";
      const messageId: string = part.messageID ?? "";
      if (!sessionId) return;
      // Skip events for the user's own message (echoed back from the server)
      if (_knownUserMsgIds[sessionId] === messageId) return;

      set((s) => {
        const msgs = s.messages[sessionId] ?? [];
        const idx = msgs.findIndex((m) => m.isStreaming || m.id === messageId);
        if (idx === -1) return {};
        const updated = [...msgs];
        const existing = updated[idx];

        const contentParts = [...existing.contentParts];

        if (part.type === "text") {
          // Append delta to the existing text part; add a new one if none yet.
          // This preserves the position relative to tool parts that arrived first.
          const append: string = typeof props.delta === "string" ? props.delta : (part.text ?? "");
          const textIdx = contentParts.findIndex((p) => p.kind === "text");
          if (textIdx >= 0) {
            const tp = contentParts[textIdx] as ContentPart & { kind: "text" };
            const newText = typeof props.delta === "string" ? tp.text + append : (part.text ?? tp.text);
            contentParts[textIdx] = { kind: "text", text: newText };
          } else {
            contentParts.push({ kind: "text", text: append });
          }
          updated[idx] = { ...existing, id: messageId, contentParts };
        } else if (part.type === "tool") {
          const state = part.state as any;
          const callID: string = part.callID ?? part.id ?? "";
          const toolName: string = part.tool ?? "";
          const entry: ContentPart = {
            kind: "tool",
            callID,
            toolName,
            args: state?.input ?? {},
            result: state?.output ?? state?.error,
            status: (state?.status ?? "pending") as "pending" | "running" | "completed" | "error",
          };
          const toolIdx = callID
            ? contentParts.findIndex((p) => p.kind === "tool" && (p as any).callID === callID)
            : -1;
          if (toolIdx >= 0) {
            contentParts[toolIdx] = entry;
          } else {
            contentParts.push(entry);
          }
          updated[idx] = { ...existing, id: messageId, contentParts };
        }
        return { messages: { ...s.messages, [sessionId]: updated } };
      });

    } else if (type === "session.updated") {
      const info = props.info as any;
      if (!info?.id) return;
      const rawTitle: string = typeof info.title === "string" ? info.title : "";
      // Only apply if opencode generated a real (non-default) title
      if (!rawTitle || /^New session\s*[-\u2013]\s*\d{4}-\d{2}-\d{2}/i.test(rawTitle)) return;
      const title = resolveTitle(info.id, rawTitle);
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === info.id ? { ...sess, title } : sess
        ),
      }));

    } else if (type === "session.idle") {
      const sessionId: string = props.sessionID ?? "";
      if (!sessionId) return;

      // Capture whether this session was streaming BEFORE updating state
      const wasStreaming = get().streamingSessionId === sessionId;

      set((s) => {
        const msgs = s.messages[sessionId] ?? [];
        const updated = msgs.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        );
        return {
          isStreaming: s.streamingSessionId === sessionId ? false : s.isStreaming,
          streamingSessionId: s.streamingSessionId === sessionId ? null : s.streamingSessionId,
          lastFailedQuery: s.streamingSessionId === sessionId ? null : s.lastFailedQuery,
          messages: { ...s.messages, [sessionId]: updated },
        };
      });

      // ── Auto-commit: snapshot code changes after agent finishes ──
      if (!wasStreaming) {
        console.log("[AgentStore] auto-commit skipped: session was not streaming, session:", sessionId);
        return;
      }
      const pkg = usePackageStore.getState().current;
      if (!pkg?.dir) {
        console.log("[AgentStore] auto-commit skipped: no project dir, session:", sessionId);
        return;
      }
      const msgs = get().messages[sessionId] ?? [];
      // Use the last user query as commit message
      const lastUser = [...msgs].reverse().find((m) => m.role === "user");
      let summary = "AI generated code";
      if (lastUser) {
        const queryText = lastUser.contentParts
          .filter((p) => p.kind === "text")
          .map((p) => (p as ContentPart & { kind: "text" }).text)
          .join("")
          .trim();
        if (queryText.length > 3) {
          summary = queryText.length > 80 ? queryText.slice(0, 77) + "…" : queryText;
        }
      }
      console.log("[AgentStore] triggering auto-commit for session:", sessionId, "summary:", summary.slice(0, 40));
      // Use sessionId as taskId (each idle round maps to one checkpoint)
      window.devtool.git.autoCommit(pkg.dir, sessionId, summary)
        .then((result) => {
          if (result) {
            console.log("[AgentStore] auto-commit created:", result.shortOid, result.fileCount, "files");
            // fullRefresh atomically reloads git data + checkpoint tasks in one set() call,
            // avoiding the stale-data race where intermediate state wins the render.
            useGitStore.getState().fullRefresh(pkg.dir).catch(
              (err) => console.warn("[AgentStore] git fullRefresh failed:", err)
            );
          } else {
            console.log("[AgentStore] auto-commit: no file changes");
          }
        })
        .catch((err) => console.warn("[AgentStore] auto-commit failed:", err));

    } else if (type === "session.error") {
      const sessionId: string | undefined = props.sessionID;
      const errMsg: string = (props.error as any)?.data?.message ?? t("common.unknownError");
      set((s) => {
        if (!sessionId) return { isStreaming: false, streamingSessionId: null };
        const msgs = s.messages[sessionId] ?? [];
        const updated = msgs.map((m) =>
          m.isStreaming
            ? { ...m, isStreaming: false, contentParts: [...m.contentParts, { kind: "text" as const, text: `❌ ${t("tool.errorMessage", { msg: errMsg })}` }] }
            : m
        );
        return {
          isStreaming: false,
          streamingSessionId: null,
          messages: { ...s.messages, [sessionId]: updated },
        };
      });
    }
  },
}));
