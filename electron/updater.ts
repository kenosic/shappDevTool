import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater, UpdateInfo, ProgressInfo } from "electron-updater";

// ── Update status type (shared with renderer via IPC) ─────────────
export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "not-available" }
  | { state: "available"; version: string; releaseDate: string }
  | { state: "downloading"; version: string; percent: number; bytesPerSecond: number; total: number; transferred: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

// ── Configuration ─────────────────────────────────────────────────

autoUpdater.autoDownload = false;      // Require explicit user confirmation
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;
autoUpdater.allowDowngrade = false;

// ── Helpers ───────────────────────────────────────────────────────

function broadcast(win: BrowserWindow, status: UpdateStatus): void {
  if (!win.isDestroyed()) {
    win.webContents.send("update:status", status);
  }
}

// ── Public init ───────────────────────────────────────────────────

export function initUpdater(win: BrowserWindow): void {
  // Only run in packaged mode; skip in dev to avoid polluting logs
  if (!app.isPackaged) return;

  // ── autoUpdater events ────────────────────────────────────────
  autoUpdater.on("checking-for-update", () => {
    broadcast(win, { state: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    broadcast(win, {
      state: "available",
      version: info.version,
      releaseDate: info.releaseDate ?? "",
    });
  });

  autoUpdater.on("update-not-available", () => {
    broadcast(win, { state: "not-available" });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    // info from electron-updater: { bytesPerSecond, percent, total, transferred, delta }
    const currentVersion = autoUpdater.currentVersion?.version ?? "";
    broadcast(win, {
      state: "downloading",
      version: currentVersion,
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    broadcast(win, { state: "downloaded", version: info.version });
  });

  autoUpdater.on("error", (err: Error) => {
    broadcast(win, { state: "error", message: err.message });
  });

  // ── IPC handlers ──────────────────────────────────────────────
  ipcMain.handle("update:check", async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // Silently ignore network errors during manual check
    }
  });

  ipcMain.handle("update:download", async () => {
    await autoUpdater.downloadUpdate();
  });

  ipcMain.handle("update:install", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // ── Auto-check on startup (delayed to avoid blocking UI) ─────
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Ignore network failures on startup check
    });
  }, 5_000);
}
