import { create } from "zustand";
import type { PackageInfo } from "../types/ipc";
import { useAgentStore } from "./agentStore";

type PackageState = {
  current: PackageInfo | null;
  recentFolders: string[];
  isLoading: boolean;
  error: string | null;

  setCurrent: (pkg: PackageInfo | null) => void;
  setManifest: (manifest: PackageInfo["manifest"]) => void;
  setRecentFolders: (folders: string[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
};

export const usePackageStore = create<PackageState>((set, get) => ({
  current: null,
  recentFolders: [],
  isLoading: false,
  error: null,

  setCurrent: (pkg) => {
    const prevDir = get().current?.dir;
    set({ current: pkg, error: null });
    // Only restart the OpenCode server (and reset session state) when the
    // project directory actually changes.  A same-directory reload (e.g.
    // hot-reload or manual Reload button) must not disturb the Agent panel.
    if (pkg?.dir && pkg.dir !== prevDir) {
      useAgentStore.getState().handleProjectChange(pkg.dir).catch(() => {});
    }
  },
  setManifest: (manifest) =>
    set((s) => s.current ? { current: { ...s.current, manifest } } : {}),
  setRecentFolders: (folders) => set({ recentFolders: folders }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  clear: () => set({ current: null, error: null }),
}));
