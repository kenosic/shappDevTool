import { create } from "zustand";
import type { VSCodeExtension } from "../types/ipc";

interface ExtensionState {
  extensions: VSCodeExtension[];
  loading: boolean;
  searchQuery: string;
  icons: Record<string, string>; // extensionId -> base64 data URL
  setExtensions: (exts: VSCodeExtension[]) => void;
  setLoading: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  setIcon: (extensionId: string, dataUrl: string | null) => void;
  refresh: () => Promise<void>;
  install: (vsixPath: string) => Promise<VSCodeExtension>;
  installFromDialog: () => Promise<VSCodeExtension | null>;
  uninstall: (extensionId: string) => Promise<void>;
  toggleEnabled: (extensionId: string, enabled: boolean) => Promise<void>;
}

export const useExtensionStore = create<ExtensionState>((set, get) => ({
  extensions: [],
  loading: false,
  searchQuery: "",
  icons: {},

  setExtensions: (exts) => set({ extensions: exts }),
  setLoading: (v) => set({ loading: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setIcon: (extensionId, dataUrl) =>
    set((s) => ({
      icons: dataUrl
        ? { ...s.icons, [extensionId]: dataUrl }
        : s.icons,
    })),

  refresh: async () => {
    set({ loading: true });
    try {
      const exts = await window.devtool.extensions.list();
      set({ extensions: exts, loading: false });

      // Load icons for extensions that have them
      for (const ext of exts) {
        if (ext.icon) {
          try {
            const iconData = await window.devtool.extensions.getIcon(ext.id);
            if (iconData) {
              set((s) => ({
                icons: { ...s.icons, [ext.id]: iconData },
              }));
            }
          } catch {
            // icon load failure is non-fatal
          }
        }
      }
    } catch {
      set({ loading: false });
    }
  },

  install: async (vsixPath: string) => {
    const ext = await window.devtool.extensions.install(vsixPath);
    await get().refresh();
    return ext;
  },

  installFromDialog: async () => {
    const ext = await window.devtool.extensions.installFromDialog();
    if (ext) {
      await get().refresh();
    }
    return ext;
  },

  uninstall: async (extensionId: string) => {
    await window.devtool.extensions.uninstall(extensionId);
    await get().refresh();
  },

  toggleEnabled: async (extensionId: string, enabled: boolean) => {
    await window.devtool.extensions.setEnabled(extensionId, enabled);
    set((s) => ({
      extensions: s.extensions.map((e) =>
        e.id === extensionId ? { ...e, enabled } : e
      ),
    }));
  },
}));
