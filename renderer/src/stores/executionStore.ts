import { create } from "zustand";
import type { RunResult, MockContext } from "../types/ipc";

type ExecutionState = {
  status: "idle" | "running" | "error";
  lastResult: RunResult | null;
  method: string;
  rawParams: string;
  mockContext: MockContext;
  selectedEntry: string;

  setStatus: (status: ExecutionState["status"]) => void;
  setResult: (result: RunResult | null) => void;
  setMethod: (method: string) => void;
  setRawParams: (raw: string) => void;
  setMockContext: (ctx: MockContext) => void;
  setSelectedEntry: (entry: string) => void;
};

const DEFAULT_MOCK_CONTEXT: MockContext = {
  userId: "dev_user_001",
  deviceId: "dev_device_local",
  scopes: ["db.*"],
  nickname: "DevUser",
  roles: [],
  locale: "zh-CN",
  geo: {
    enabled: false,
    latitude: 39.9042,
    longitude: 116.4074,
    accuracy: 50,
  },
};

export const useExecutionStore = create<ExecutionState>((set) => ({
  status: "idle",
  lastResult: null,
  method: "hello",
  rawParams: "{}",
  mockContext: DEFAULT_MOCK_CONTEXT,
  selectedEntry: "",

  setStatus: (status) => set({ status }),
  setResult: (result) => set({ lastResult: result }),
  setMethod: (method) => set({ method }),
  setRawParams: (raw) => set({ rawParams: raw }),
  setMockContext: (ctx) => set({ mockContext: ctx }),
  setSelectedEntry: (entry) => set({ selectedEntry: entry }),
}));
