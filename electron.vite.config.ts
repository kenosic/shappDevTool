import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@opencode-ai/sdk"] })],
    resolve: {
      alias: {
        "@": resolve("electron"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("electron/main.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("electron/preload.ts"),
        },
      },
    },
  },
  renderer: {
    root: "renderer",
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve("renderer/src"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("renderer/index.html"),
        },
      },
    },
  },
});
