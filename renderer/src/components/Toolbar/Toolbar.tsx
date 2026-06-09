import React, { useCallback, useEffect, useState } from "react";
import { usePackageStore } from "../../stores/packageStore";
import { useExecutionStore } from "../../stores/executionStore";
import { useLogStore } from "../../stores/logStore";
import { useToastStore } from "../../stores/toastStore";
import { useT } from "../../i18n";
import styles from "./Toolbar.module.css";

interface ToolbarProps {
  onOpenFolder: () => void;
  onReload: () => void;
  onOpenSettings: () => void;
}

export default function Toolbar({ onOpenFolder, onReload, onOpenSettings }: ToolbarProps) {
  const t = useT();
  const pkg = usePackageStore((s) => s.current);
  const setCurrent = usePackageStore((s) => s.setCurrent);
  const status = useExecutionStore((s) => s.status);
  const selectedEntry = useExecutionStore((s) => s.selectedEntry);
  const method = useExecutionStore((s) => s.method);
  const rawParams = useExecutionStore((s) => s.rawParams);
  const mockContext = useExecutionStore((s) => s.mockContext);
  const setStatus = useExecutionStore((s) => s.setStatus);
  const setResult = useExecutionStore((s) => s.setResult);
  const appendSeparator = useLogStore((s) => s.appendSeparator);
  const showToast = useToastStore((s) => s.show);

  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.devtool.server.getUrl().then((url) => setServerUrl(url || null));
  }, [status, pkg]);

  const handleRun = useCallback(async () => {
    if (!pkg) return;
    const entryFile = selectedEntry || pkg.entries[0];
    if (!entryFile) return;

    let params: unknown;
    try {
      params = JSON.parse(rawParams || "{}");
    } catch {
      return;
    }

    appendSeparator(t("common.runLabel", { method: method || "—" }));
    setStatus("running");
    setResult(null);
    try {
      const result = await window.devtool.execution.run({
        appDir: pkg.dir,
        entryFile,
        method: method || "",
        params,
        mockContext,
      });
      setStatus(result.ok ? "idle" : "error");
      setResult(result);
    } catch {
      setStatus("error");
    }
  }, [pkg, selectedEntry, method, rawParams, mockContext]);

  const handleStop = useCallback(() => {
    window.devtool.execution.cancel();
  }, []);

  const handleOpenFolderWithReload = useCallback(async () => {
    try {
      const result = await window.devtool.package.openFolder();
      if (result) {
        setCurrent(result);
        onOpenFolder();
        showToast(t("titlebar.switchedTo", { name: result.manifest.name ?? result.dir }), "success");
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const msg = raw.replace(/^Error invoking remote method '[^']+': Error: /, "");
      showToast(msg || t("common.openFolderFailed"), "error");
    }
  }, [onOpenFolder, setCurrent, showToast]);

  const handleCopyUrl = useCallback(async () => {
    if (!serverUrl) return;
    await navigator.clipboard.writeText(serverUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [serverUrl]);

  const isRunning = status === "running";
  const hasError = status === "error";

  return (
    <div className={styles.toolbar}>
      <button className={styles.primaryBtn} onClick={handleOpenFolderWithReload} title={t("toolbar.openFolderTitle")}>
        <FolderIcon /> {t("toolbar.openFolder")}
      </button>

      {isRunning ? (
        <button className={`${styles.actionBtn} ${styles.stopBtn}`} onClick={handleStop} title={t("toolbar.stopExec")}>
          <StopIcon /> {t("common.stop")}
        </button>
      ) : (
        <button className={`${styles.actionBtn} ${styles.runBtn}`} onClick={handleRun} disabled={!pkg} title={t("toolbar.runApi")}>
          <RunIcon /> {t("toolbar.run")}
        </button>
      )}

      <button className={styles.iconBtn} onClick={onReload} disabled={!pkg} title={t("toolbar.reloadApp")}>
        <ReloadIcon />
      </button>

      <div className={styles.spacer} />

      {serverUrl && (
        <button className={`${styles.urlBar} ${copied ? styles.urlBarCopied : ""}`} onClick={handleCopyUrl} title={copied ? t("titlebar.copied") : t("titlebar.copyUrl")}>
          <LinkIcon />
          <span className={styles.urlText}>{serverUrl}</span>
        </button>
      )}

      {hasError && (
        <div className={styles.errorBadge} title={t("toolbar.lastError")}>
          <BellIcon />
          <span className={styles.badgeDot} />
        </div>
      )}

      <button className={styles.iconBtn} onClick={() => window.devtool.window.openDevTools()} title={t("toolbar.openDevtools")}>
        <DevToolsIcon />
      </button>

      <button className={styles.iconBtn} onClick={onOpenSettings} title={t("common.settings")}>
        <SettingsIcon />
      </button>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M1 3.5C1 2.67 1.67 2 2.5 2H5.5L7 3.5H11.5C12.33 3.5 13 4.17 13 5V10.5C13 11.33 12.33 12 11.5 12H2.5C1.67 12 1 11.33 1 10.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 2L10 6L3 10V2Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function ReloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.5 7A4.5 4.5 0 1 1 7 2.5c1.2 0 2.3.47 3.18 1.25L12 5.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <polyline points="12,3 12,5.5 9.5,5.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M5 3H3a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 1h4v4M11 1L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5C7 1.5 4.5 2.5 4.5 7V9.5L3 11H11L9.5 9.5V7C9.5 2.5 7 1.5 7 1.5Z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <path d="M6 11.5a1 1 0 002 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function DevToolsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M4.5 5L6.5 7L4.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7.5" y1="9" x2="10" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.1 3.1l1.05 1.05M10.85 10.85l1.05 1.05M10.85 4.15L9.8 5.2M4.15 10.85l-1.05 1.05"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
