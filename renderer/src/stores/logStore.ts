import { create } from "zustand";
import type { LogEntry } from "../types/ipc";

const MAX_LOGS = 2000;

// UI-level log entry — extends LogEntry with optional separator type
export type UiLogEntry =
  | (LogEntry & { uiType?: "normal" })
  | { uiType: "separator"; ts: number; label: string };

type LogState = {
  entries: UiLogEntry[];
  filter: "all" | "log" | "warn" | "error" | "info";
  search: string;

  append: (entry: LogEntry) => void;
  appendSeparator: (label: string) => void;
  clear: () => void;
  setFilter: (filter: LogState["filter"]) => void;
  setSearch: (q: string) => void;
};

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  filter: "all",
  search: "",

  append: (entry) =>
    set((s) => ({
      entries:
        s.entries.length >= MAX_LOGS
          ? [...s.entries.slice(-MAX_LOGS + 1), { ...entry, uiType: "normal" } as UiLogEntry]
          : [...s.entries, { ...entry, uiType: "normal" } as UiLogEntry],
    })),

  appendSeparator: (label) =>
    set((s) => ({
      entries: [...s.entries, { uiType: "separator", ts: Date.now(), label }],
    })),

  clear: () => set({ entries: [] }),

  setFilter: (filter) => set({ filter }),
  setSearch: (q) => set({ search: q }),
}));
