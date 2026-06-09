import { create } from "zustand";
import type { AgentSession, AgentMessage, AgentMessagePart, AgentProvider, AgentEvent, AgentConfigData, AgentCatalogProvider, FileAttachment } from "../types/ipc";
import { usePackageStore } from "./packageStore";
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
  | { kind: "tool"; callID: string; toolName: string; args: Record<string, unknown>; result?: string; status: "pending" | "running" | "completed" | "error" };

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
    }
  }
  return { id: msg.id, role: msg.role, contentParts, isStreaming, createdAt: msg.createdAt };
}

// Module-level map: tracks the real server-assigned user message ID per session.
// Used to filter out user-message echoes from message.part.updated SSE events.
const _knownUserMsgIds: Record<string, string> = {};

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
  mode: "build" | "plan";

  // Initialisation
  initialized: boolean;
  serverStatus: "unknown" | "checking" | "ready" | "unreachable";
  serverError: string | null;

  // Question tool interactive state
  pendingQuestion: PendingQuestion | null;

  // Actions
  init: () => Promise<void>;
  retryConnection: () => Promise<void>;
  _connectServer: () => Promise<void>;
  createSession: (directory?: string) => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => Promise<void>;
  newSession: () => void;
  sendMessage: (text: string, files?: FileAttachment[]) => Promise<void>;
  abortStreaming: () => Promise<void>;
  togglePanel: () => void;
  setPanelWidth: (w: number) => void;
  setModel: (provider: string, model: string) => void;
  setMode: (mode: "build" | "plan") => void;
  loadCatalog: () => Promise<void>;
  addProviderKey: (providerId: string, key: string) => Promise<void>;
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
  selectedProvider: "anthropic",
  selectedModel: "claude-opus-4-5",
  providers: [],
  configData: null,
  catalogProviders: [],
  catalogLoading: false,
  mode: "build",
  initialized: false,
  serverStatus: "unknown",
  serverError: null,
  pendingQuestion: null,

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

    // Load sessions
    try {
      const sessions = await window.devtool.agent.listSessions();
      set({ sessions });
    } catch { /* ignore */ }

    // Load providers
    try {
      const providers = await window.devtool.agent.listProviders();
      if (providers.length > 0) set({ providers });
    } catch { /* ignore */ }

    // Load config (free models + provider groups)
    try {
      const configData = await window.devtool.agent.getConfig();
      set({ configData });
      // Update selected model from defaults if not yet set
      const s = get();
      if (s.selectedProvider === "anthropic" && configData.defaultProviderId) {
        set({
          selectedProvider: configData.defaultProviderId,
          selectedModel: configData.defaultModelId,
        });
      }
    } catch { /* ignore */ }

    // Subscribe to SSE events
    window.devtool.agent.onEvent((event) => get()._handleEvent(event));
    window.devtool.agent.subscribe().catch(() => {});

    // Subscribe to question tool interactive requests
    window.devtool.agent.onQuestion((questionData) => {
      set({ pendingQuestion: questionData });
    });
  },

  // ── createSession ─────────────────────────────────────────────────
  // ── newSession (lazy — no IPC until first message) ───────────────────
  newSession: () => {
    set({ activeSessionId: null });
  },

  // ── createSession ────────────────────────────────────────
  createSession: async (directory?: string) => {
    const session = await window.devtool.agent.createSession(directory);
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: session.id,
      messages: { ...s.messages, [session.id]: [] },
    }));
    return session.id;
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

    // Optimistically add user message
    const userMsg: DisplayMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      contentParts: [{ kind: "text", text }],
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
      if (!session || session.title !== "New Session") return {};
      const autoTitle = text.slice(0, 35).trim() + (text.length > 35 ? "\u2026" : "");
      return {
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId ? { ...sess, title: autoTitle } : sess
        ),
      };
    });

    try {
      await window.devtool.agent.sendPrompt(sessionId, text, projectDir, get().mode, files);
    } catch (err) {
      // Remove placeholder on error
      set((s) => ({
        isStreaming: false,
        streamingSessionId: null,
        messages: {
          ...s.messages,
          [sessionId!]: (s.messages[sessionId!] ?? []).filter((m) => m.id !== placeholderId),
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
    set({ isStreaming: false, streamingSessionId: null });
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
    set({ sessions: [], activeSessionId: null, messages: {}, isStreaming: false, streamingSessionId: null, pendingQuestion: null });

    // Wait briefly for the server to stabilise then reload sessions.
    await new Promise((r) => setTimeout(r, 800));
    try {
      const sessions = await window.devtool.agent.listSessions();
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
      // Skip missing, empty, or OpenCode's default timestamp title format
      if (!info?.id || typeof info.title !== "string" || !info.title.trim()) return;
      if (/^New session\s*[-\u2013]\s*\d{4}-\d{2}-\d{2}/i.test(info.title)) return;
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === info.id ? { ...sess, title: info.title } : sess
        ),
      }));

    } else if (type === "session.idle") {
      const sessionId: string = props.sessionID ?? "";
      if (!sessionId) return;
      set((s) => {
        const msgs = s.messages[sessionId] ?? [];
        const updated = msgs.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        );
        return {
          isStreaming: s.streamingSessionId === sessionId ? false : s.isStreaming,
          streamingSessionId: s.streamingSessionId === sessionId ? null : s.streamingSessionId,
          messages: { ...s.messages, [sessionId]: updated },
        };
      });

    } else if (type === "session.error") {
      const sessionId: string | undefined = props.sessionID;
      const errMsg: string = (props.error as any)?.data?.message ?? t("common.unknownError");
      set((s) => {
        if (!sessionId) return { isStreaming: false, streamingSessionId: null };
        const msgs = s.messages[sessionId] ?? [];
        const updated = msgs.map((m) =>
          m.isStreaming
            ? { ...m, isStreaming: false, textContent: m.textContent || t("tool.errorMessage", { msg: errMsg }) }
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
