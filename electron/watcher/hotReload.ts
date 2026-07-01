import { watch, FSWatcher } from "chokidar";
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
  // Debounce timers – if multiple file events arrive in quick succession (e.g. during a
  // build tool write burst), we coalesce them into a single reload notification.  This also
  // guarantees that a change arriving *while* a reload is still in-flight never gets dropped:
  // any new event cancels the previous timer and schedules a fresh one so the renderer always
  // ends up reloading to the final state.
  private frontendTimer: ReturnType<typeof setTimeout> | null = null;
  private backendTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 150;

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

    const fireFrontend = () => {
      if (this.frontendTimer) clearTimeout(this.frontendTimer);
      this.frontendTimer = setTimeout(() => {
        this.frontendTimer = null;
        this.callbacks?.onFrontendChange();
      }, this.DEBOUNCE_MS);
    };

    const fireBackend = () => {
      if (this.backendTimer) clearTimeout(this.backendTimer);
      this.backendTimer = setTimeout(() => {
        this.backendTimer = null;
        this.callbacks?.onBackendChange();
      }, this.DEBOUNCE_MS);
    };

    const dispatch = (path: string) => {
      const normalized = path.replace(/\\/g, "/");
      if (normalized.endsWith("/manifest.json") || normalized.endsWith("/app.manifest.json")) {
        callbacks.onManifestChange?.();
      } else if (normalized.includes("/frontend/")) {
        fireFrontend();
      } else if (
        normalized.includes("/backend/") ||
        normalized.includes("/logic/")
      ) {
        fireBackend();
      }
    };

    this.watcher.on("change", dispatch);
    this.watcher.on("add", dispatch);
    this.watcher.on("unlink", dispatch);
  }

  stop(): void {
    if (this.frontendTimer) { clearTimeout(this.frontendTimer); this.frontendTimer = null; }
    if (this.backendTimer) { clearTimeout(this.backendTimer); this.backendTimer = null; }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.appDir = null;
    this.callbacks = null;
  }
}
