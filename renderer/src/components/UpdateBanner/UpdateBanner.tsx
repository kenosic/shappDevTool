import React, { useEffect, useState, useCallback } from "react";
import styles from "./UpdateBanner.module.css";
import type { UpdateStatus } from "../../types/ipc";
import { useT } from "../../i18n";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatSpeed(bps: number): string {
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}

export default function UpdateBanner() {
  const t = useT();
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsub = window.devtool.update.onStatus((s) => {
      setStatus(s);
      // Reset dismiss when a new version becomes available
      if (s.state === "available" || s.state === "downloaded") {
        setDismissed(false);
      }
    });
    return unsub;
  }, []);

  const handleDownload = useCallback(() => {
    window.devtool.update.download().catch(console.error);
  }, []);

  const handleInstall = useCallback(() => {
    window.devtool.update.install().catch(console.error);
  }, []);

  // Not visible states
  if (
    dismissed ||
    status.state === "idle" ||
    status.state === "checking" ||
    status.state === "not-available" ||
    status.state === "error"
  ) {
    return null;
  }

  if (status.state === "available") {
    return (
      <div className={`${styles.banner} ${styles.available}`}>
        <span className={styles.icon}>🎉</span>
        <span className={styles.text}>
          {t("update.newVersion")} <strong>v{status.version}</strong> {t("update.available")}
        </span>
        <button className={styles.btnPrimary} onClick={handleDownload}>
          {t("update.download")}
        </button>
        <button className={styles.btnDismiss} onClick={() => setDismissed(true)} title={t("update.remindLater")}>
          ✕
        </button>
      </div>
    );
  }

  if (status.state === "downloading") {
    const pct = Math.round(status.percent);
    return (
      <div className={`${styles.banner} ${styles.downloading}`}>
        <span className={styles.icon}>⬇️</span>
        <span className={styles.text}>
          {t("update.downloading", { version: status.version })}
        </span>
        <div className={styles.progressWrap}>
          <div className={styles.progressBar} style={{ width: `${pct}%` }} />
        </div>
        <span className={styles.progressLabel}>
          {pct}% · {formatBytes(status.transferred)}/{formatBytes(status.total)} · {formatSpeed(status.bytesPerSecond)}
        </span>
      </div>
    );
  }

  if (status.state === "downloaded") {
    return (
      <div className={`${styles.banner} ${styles.downloaded}`}>
        <span className={styles.icon}>✅</span>
        <span className={styles.text}>
          v{status.version} {t("update.downloaded")}
        </span>
        <button className={styles.btnPrimary} onClick={handleInstall}>
          {t("update.restartNow")}
        </button>
        <button className={styles.btnDismiss} onClick={() => setDismissed(true)} title={t("update.restartLater")}>
          ✕
        </button>
      </div>
    );
  }

  return null;
}
