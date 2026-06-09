import { watch, FSWatcher } from "chokidar";
import { BrowserWindow } from "electron";
import { join } from "path";

type HotReloadCallback = {
  onFrontendChange: () => void;
  onBackendChange: () => void;
  onManifestChange?: () => void;
};

export class HotReloader {
  private watcher: FSWatcher | null = null;
  private appDir: string | null = null;
  private callbacks: HotReloadCallback | null = null;

  start(appDir: string, callbacks: HotReloadCallback): void {
    this.stop();
    this.appDir = appDir;
    this.callbacks = callbacks;

    const frontendDir = join(appDir, "frontend");
    const backendDir = join(appDir, "backend");
    const logicDir = join(appDir, "logic");
    const manifestFiles = [
      join(appDir, "manifest.json"),
      join(appDir, "app.manifest.json"),
    ];

    // Watch both frontend and backend directories
    this.watcher = watch([frontendDir, backendDir, logicDir, ...manifestFiles], {
      ignored: [
        /(^|[/\\])\../, // dot files
        /node_modules/,
        /\.devtool/,
        /\*\*__devtool_runner_\d+\.ts/,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });

    this.watcher.on("change", (path: string) => {
      const normalized = path.replace(/\\/g, "/");
      if (normalized.endsWith("/manifest.json") || normalized.endsWith("/app.manifest.json")) {
        callbacks.onManifestChange?.();
      } else if (normalized.includes("/frontend/")) {
        callbacks.onFrontendChange();
      } else if (
        normalized.includes("/backend/") ||
        normalized.includes("/logic/")
      ) {
        callbacks.onBackendChange();
      }
    });

    this.watcher.on("add", (path: string) => {
      const normalized = path.replace(/\\/g, "/");
      if (normalized.includes("/frontend/")) {
        callbacks.onFrontendChange();
      } else if (
        normalized.includes("/backend/") ||
        normalized.includes("/logic/")
      ) {
        callbacks.onBackendChange();
      }
    });

    this.watcher.on("unlink", (path: string) => {
      const normalized = path.replace(/\\/g, "/");
      if (normalized.includes("/frontend/")) {
        callbacks.onFrontendChange();
      } else if (
        normalized.includes("/backend/") ||
        normalized.includes("/logic/")
      ) {
        callbacks.onBackendChange();
      }
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.appDir = null;
    this.callbacks = null;
  }
}
