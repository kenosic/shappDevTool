import React, { useState } from "react";
import { usePackageStore } from "../stores/packageStore";
import { useT } from "../i18n";
import styles from "./WelcomePage.module.css";
import logoPng from "../../../resources/logo.png";

export default function WelcomePage() {
  const t = useT();
  const isMac = navigator.platform.startsWith("Mac");
  const setCurrent = usePackageStore((s) => s.setCurrent);
  const recentFolders = usePackageStore((s) => s.recentFolders);
  const setRecentFolders = usePackageStore((s) => s.setRecentFolders);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<"none" | "valid" | "invalid">("none");

  // Returns true if the dragged item looks like a directory.
  // Falls back to item.type === "" because webkitGetAsEntry() can return null
  // for folders on Windows/Electron.
  function looksLikeDir(item: DataTransferItem) {
    if (item.kind !== "file") return false;
    const entry = item.webkitGetAsEntry();
    if (entry !== null) return entry.isDirectory;
    return item.type === "";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    const hasDir = Array.from(e.dataTransfer.items).some(looksLikeDir);
    setDragState(hasDir ? "valid" : "invalid");
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only clear when the cursor truly leaves the drop zone (not just moving to a child).
    if ((e.currentTarget as Element).contains(e.relatedTarget as Node)) return;
    setDragState("none");
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragState("none");

    // ── diagnostic logging ──────────────────────────────────────────────────
    console.log("[drop] types:", Array.from(e.dataTransfer.types));
    console.log("[drop] files.length:", e.dataTransfer.files.length);
    Array.from(e.dataTransfer.files).forEach((f, i) => {
      const fe = f as File & { path?: string };
      console.log(`[drop] files[${i}] name=${f.name} size=${f.size} type="${f.type}" path=${fe.path ?? "(none)"}`);
    });
    console.log("[drop] items.length:", e.dataTransfer.items.length);
    Array.from(e.dataTransfer.items).forEach((item, i) => {
      const entry = item.webkitGetAsEntry();
      console.log(`[drop] items[${i}] kind=${item.kind} type="${item.type}" entry=${entry ? (entry.isDirectory ? "dir" : "file") : "null"}`);
    });
    // ────────────────────────────────────────────────────────────────────────

    // e.dataTransfer.files is the most reliable source in Electron.
    // In Electron 32+ file.path is removed; use webUtils.getPathForFile instead.
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    if (!file) {
      console.warn("[drop] No file found in dataTransfer");
      return;
    }
    const filePath = window.devtool.fileUtils.getPathForFile(file);
    console.log("[drop] getPathForFile:", filePath);
    if (!filePath) {
      console.warn("[drop] getPathForFile returned empty path");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const pkg = await window.devtool.package.loadFolder(filePath);
      console.log("[drop] loadFolder succeeded:", pkg.dir);
      setCurrent(pkg);
      setRecentFolders(await window.devtool.package.getRecent());
    } catch (err) {
      console.error("[drop] loadFolder failed:", err);
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw.replace(/^Error invoking remote method '[^']+': Error: /, "") || t("common.openFolderFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenFolder() {
    setLoading(true);
    setError(null);
    try {
      const pkg = await window.devtool.package.openFolder();
      if (pkg) {
        setCurrent(pkg);
        setRecentFolders(await window.devtool.package.getRecent());
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw.replace(/^Error invoking remote method '[^']+': Error: /, "") || t("common.openFolderFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadRecent(dir: string) {
    setLoading(true);
    setError(null);
    try {
      const pkg = await window.devtool.package.loadFolder(dir);
      setCurrent(pkg);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw.replace(/^Error invoking remote method '[^']+': Error: /, "") || t("welcome.loadFolderFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleClearRecent() {
    await window.devtool.package.clearRecent();
    setRecentFolders([]);
  }

  return (
    <div className={styles.root}>
      {/* Titlebar / drag region */}
      <div className={styles.titlebar} data-drag-region>
        {!isMac && (
          <div className={styles.winControls} data-drag-region-exclude>
            <button className={styles.winBtn} onClick={() => window.devtool.window.minimize()} aria-label={t("win.minimize")}>
              <MinimizeIcon />
            </button>
            <button className={styles.winBtn} onClick={() => window.devtool.window.maximize()} aria-label={t("win.maximize")}>
              <MaximizeIcon />
            </button>
            <button className={`${styles.winBtn} ${styles.closeBtn}`} onClick={() => window.devtool.window.close()} aria-label={t("win.close")}>
              <CloseIcon />
            </button>
          </div>
        )}
      </div>

      {/* Header: logo + app name */}
      <div className={styles.header}>
        <img className={styles.logoImage} src={logoPng} alt="Shapp logo" />
        <div>
          <h1 className={styles.title}>Shapp DevTool</h1>
          <p className={styles.subtitle}>{t("welcome.subtitle")}</p>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Body: two columns */}
      <div className={styles.body}>
        {/* Left: open folder */}
        <div className={styles.openSection}>
          <div className={styles.sectionLabel}>{t("welcome.openSection")}</div>
          <div
            className={`${styles.dropZone} ${dragState === "valid" ? styles.dropZoneActive : dragState === "invalid" ? styles.dropZoneInvalid : ""}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className={styles.dropIcon}>📁</div>
            <div className={styles.dropHint}>{t("welcome.dropHint")}</div>
            <button
              className={styles.openBtn}
              onClick={handleOpenFolder}
              disabled={loading}
            >
              {loading ? t("common.loading") : t("welcome.selectFolder")}
            </button>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Right: recent folders */}
        <div className={styles.recentSection}>
          <div className={styles.sectionLabelRow}>
            <span className={styles.sectionLabel}>{t("welcome.recent")}</span>
            {recentFolders.length > 0 && (
              <button className={styles.clearBtn} onClick={handleClearRecent}>
                {t("welcome.clear")}
              </button>
            )}
          </div>
          {recentFolders.length === 0 ? (
            <div className={styles.recentEmpty}>{t("welcome.noRecent")}</div>
          ) : (
            <ul className={styles.recentList}>
              {recentFolders.map((dir) => (
                <li key={dir}>
                  <button
                    className={styles.recentItem}
                    onClick={() => handleLoadRecent(dir)}
                    disabled={loading}
                  >
                    <span className={styles.recentIcon}>📁</span>
                    <span className={styles.recentPath}>{dir}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MinimizeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M2 5.5H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function MaximizeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="2" y="2" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M2.5 2.5L8.5 8.5M8.5 2.5L2.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
