import React, { useState, useEffect } from "react";
import { usePackageStore } from "../../stores/packageStore";
import { useExecutionStore } from "../../stores/executionStore";
import { useT } from "../../i18n";
import styles from "./StatusBar.module.css";

// SDK version constant — matches @mars/sdk package.json
const SDK_VERSION = "1.0.0";

function useMemoryMB(): number | null {
  const [mem, setMem] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      // @ts-expect-error Chromium-specific performance.memory
      const m = performance?.memory?.usedJSHeapSize;
      if (m) setMem(Math.round(m / 1024 / 1024));
    };
    update();
    const id = setInterval(update, 3000);
    return () => clearInterval(id);
  }, []);
  return mem;
}

function useCpuPercent(): number | null {
  const [cpu, setCpu] = useState<number | null>(null);
  useEffect(() => {
    let lastTime = performance.now(), frames = 0, animId = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - lastTime >= 2000) {
        const fps = frames / ((now - lastTime) / 1000);
        setCpu(Math.max(0, Math.min(99, Math.round((1 - Math.min(fps, 60) / 60) * 100))));
        frames = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);
  return cpu;
}

function useKvCount(dbPath: string | null): { count: number; sizeKb: number } | null {
  const [info, setInfo] = useState<{ count: number; sizeKb: number } | null>(null);
  const status = useExecutionStore((s) => s.status);
  useEffect(() => {
    if (!dbPath) { setInfo(null); return; }
    const refresh = async () => {
      try {
        const entries = await window.devtool.kv.getAllEntries(dbPath);
        const bytes = entries.reduce((sum: number, e: { key: string; value: string }) => sum + e.key.length + e.value.length, 0);
        setInfo({ count: entries.length, sizeKb: bytes / 1024 });
      } catch { setInfo(null); }
    };
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [dbPath, status]);
  return info;
}

export default function StatusBar() {
  const t = useT();
  const pkg = usePackageStore((s) => s.current);
  const status = useExecutionStore((s) => s.status);
  const dbPath = pkg ? `${pkg.dir}/.devtool/state.db` : null;
  const memMB = useMemoryMB();
  const cpuPct = useCpuPercent();
  const kvInfo = useKvCount(dbPath);

  const [serverPort, setServerPort] = useState<number | null>(null);
  useEffect(() => {
    window.devtool.server.getUrl().then((url) => {
      if (url) {
        try { setServerPort(parseInt(new URL(url).port, 10) || null); } catch { setServerPort(null); }
      } else { setServerPort(null); }
    });
  }, [status, pkg]);

  const statusLabel =
    status === "running" ? t("status.running") :
    status === "error"   ? t("status.failed") :
    pkg ? t("status.ready") : t("status.noApp");

  const statusClass =
    status === "running" ? styles.running :
    status === "error"   ? styles.error :
    pkg ? styles.ready : styles.idle;

  return (
    <div className={styles.bar}>
      {/* Left: run status */}
      <div className={`${styles.dot} ${statusClass}`} />
      <span className={styles.label}>{statusLabel}</span>

      {serverPort !== null && (
        <><span className={styles.sep}>|</span><span className={styles.item}>{t("status.port")}: {serverPort}</span></>
      )}

      {kvInfo !== null && (
        <><span className={styles.sep}>|</span>
        <span className={styles.item}>
          {t("status.kvKeys", { count: kvInfo.count })}
          {kvInfo.sizeKb > 0 && ` (${kvInfo.sizeKb < 1 ? `${Math.round(kvInfo.sizeKb * 1024)} B` : `${kvInfo.sizeKb.toFixed(1)} KB`})`}
        </span></>
      )}

      {memMB !== null && (
        <><span className={styles.sep}>|</span><span className={styles.item}>{t("status.mem")}: {memMB} MB</span></>
      )}

      {cpuPct !== null && (
        <><span className={styles.sep}>|</span><span className={styles.item}>CPU: {cpuPct}%</span></>
      )}

      {/* Spacer */}
      <span className={styles.spacer} />

      {/* Right: SDK version + update check */}
      <span className={styles.item}>SDK: {SDK_VERSION}</span>
      <span className={styles.sep}>|</span>
      <button className={styles.updateBtn}>
        <span className={`${styles.dot} ${styles.ready}`} />
        {t("status.checkUpdate")}
      </button>
    </div>
  );
}

