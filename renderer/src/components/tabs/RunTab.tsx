import React, { useState, useCallback } from "react";
import { usePackageStore } from "../../stores/packageStore";
import { useExecutionStore } from "../../stores/executionStore";
import { useLogStore } from "../../stores/logStore";
import { useT } from "../../i18n";
import styles from "./RunTab.module.css";

export default function RunTab() {
  const t = useT();
  const pkg = usePackageStore((s) => s.current);
  const {
    status, lastResult,
    method, rawParams, mockContext, selectedEntry,
    setMethod, setRawParams, setMockContext, setSelectedEntry, setResult,
  } = useExecutionStore();
  const appendSeparator = useLogStore((s) => s.appendSeparator);
  const setStatus = useExecutionStore((s) => s.setStatus);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!pkg) return null;

  const entryOptions = pkg.entries;
  const activeEntry = selectedEntry || entryOptions[0] || "";

  function handleParamsChange(value: string) {
    setRawParams(value);
    try {
      JSON.parse(value);
      setParamsError(null);
    } catch {
      setParamsError(t("run.jsonError"));
    }
  }

  function handleFormat() {
    try {
      const formatted = JSON.stringify(JSON.parse(rawParams), null, 2);
      setRawParams(formatted);
      setParamsError(null);
    } catch {
      setParamsError(t("run.jsonErrorFormat"));
    }
  }

  function handleReset() {
    setRawParams("{}");
    setParamsError(null);
  }

  async function handleRun() {
    if (!pkg || !activeEntry) return;
    let params: unknown;
    try {
      params = JSON.parse(rawParams);
    } catch {
      setParamsError(t("run.jsonErrorRetry"));
      return;
    }

    appendSeparator(t("common.runLabel", { method: method || "—" }));
    setStatus("running");
    setResult(null);

    const result = await window.devtool.execution.run({
      appDir: pkg.dir,
      entryFile: activeEntry,
      method,
      params,
      mockContext,
    });
    setResult(result);
    setStatus(result.ok ? "idle" : "error");
  }

  async function handleCancel() {
    await window.devtool.execution.cancel();
  }

  async function handleCopyResult() {
    if (!lastResult) return;
    const text = JSON.stringify(
      lastResult.ok ? lastResult.data : lastResult.error,
      null, 2
    );
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const isRunning = status === "running";

  const resultStatusIcon = isRunning
    ? "⏳"
    : !lastResult
    ? null
    : lastResult.ok
    ? "✅"
    : "❌";

  return (
    <div className={styles.root}>
      <div className={styles.requestPanel}>
        <div className={styles.section}>
          <label className={styles.label}>{t("run.entryFile")}</label>
          <select
            className={styles.select}
            value={activeEntry}
            onChange={(e) => setSelectedEntry(e.target.value)}
          >
            {entryOptions.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>{t("run.method")}</label>
          <input
            className={styles.input}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="e.g. hello"
          />
        </div>

        <div className={`${styles.section} ${styles.paramsSection}`}>
          <div className={styles.labelRow}>
            <label className={styles.label}>
              {t("run.params")}
              {paramsError && (
                <span className={styles.paramsError}>{paramsError}</span>
              )}
            </label>
            <div className={styles.paramActions}>
              <button className={styles.miniBtn} onClick={handleFormat} title={t("run.formatTitle")}>{t("run.format")}</button>
              <button className={styles.miniBtn} onClick={handleReset} title={t("run.resetTitle")}>{t("run.reset")}</button>
            </div>
          </div>
          <textarea
            className={`${styles.jsonEditor} ${paramsError ? styles.jsonEditorError : ""}`}
            value={rawParams}
            onChange={(e) => handleParamsChange(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className={styles.section}>
          <label className={styles.label}>{t("run.mockContext")}</label>
          <div className={styles.mockGrid}>
            <span className={styles.mockKey}>userId</span>
            <input
              className={styles.mockInput}
              value={mockContext.userId ?? ""}
              onChange={(e) => setMockContext({ ...mockContext, userId: e.target.value })}
              placeholder="u_001"
            />
            <span className={styles.mockKey}>deviceId</span>
            <input
              className={styles.mockInput}
              value={mockContext.deviceId ?? ""}
              onChange={(e) => setMockContext({ ...mockContext, deviceId: e.target.value })}
              placeholder="dev_local"
            />
            <span className={styles.mockKey}>scopes</span>
            <input
              className={styles.mockInput}
              value={(mockContext.scopes ?? []).join(", ")}
              onChange={(e) =>
                setMockContext({
                  ...mockContext,
                  scopes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="db.*, user.id.read"
            />
            <span className={styles.mockKey}>{t("run.nickname")}</span>
            <input
              className={styles.mockInput}
              value={mockContext.nickname ?? ""}
              onChange={(e) => setMockContext({ ...mockContext, nickname: e.target.value })}
              placeholder="DevUser"
            />
            <span className={styles.mockKey}>{t("run.roles")}</span>
            <input
              className={styles.mockInput}
              value={(mockContext.roles ?? []).join(", ")}
              onChange={(e) =>
                setMockContext({
                  ...mockContext,
                  roles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="admin, editor"
            />
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>{t("run.geoMock")}</label>
          <div className={styles.mockGrid}>
            <span className={styles.mockKey}>{t("run.enable")}</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-primary)" }}>
              <input
                type="checkbox"
                checked={mockContext.geo?.enabled ?? false}
                onChange={(e) =>
                  setMockContext({
                    ...mockContext,
                    geo: {
                      enabled: e.target.checked,
                      latitude: mockContext.geo?.latitude ?? 39.9042,
                      longitude: mockContext.geo?.longitude ?? 116.4074,
                      accuracy: mockContext.geo?.accuracy ?? 50,
                    },
                  })
                }
              />
              {t("run.simulateGeo")}
            </label>
            {mockContext.geo?.enabled && (
              <>
                <span className={styles.mockKey}>{t("run.lat")}</span>
                <input
                  className={styles.mockInput}
                  type="number"
                  step="0.0001"
                  value={mockContext.geo.latitude}
                  onChange={(e) =>
                    setMockContext({ ...mockContext, geo: { ...mockContext.geo!, latitude: parseFloat(e.target.value) || 0 } })
                  }
                />
                <span className={styles.mockKey}>{t("run.lng")}</span>
                <input
                  className={styles.mockInput}
                  type="number"
                  step="0.0001"
                  value={mockContext.geo.longitude}
                  onChange={(e) =>
                    setMockContext({ ...mockContext, geo: { ...mockContext.geo!, longitude: parseFloat(e.target.value) || 0 } })
                  }
                />
                <span className={styles.mockKey}>{t("run.accuracy")}</span>
                <input
                  className={styles.mockInput}
                  type="number"
                  value={mockContext.geo.accuracy}
                  onChange={(e) =>
                    setMockContext({ ...mockContext, geo: { ...mockContext.geo!, accuracy: parseInt(e.target.value) || 50 } })
                  }
                />
              </>
            )}
          </div>
        </div>

        <div className={styles.runActions}>
          {!isRunning ? (
            <button
              className={styles.runBtn}
              onClick={handleRun}
              disabled={!!paramsError || !activeEntry}
            >
              {t("run.runEntry")}
            </button>
          ) : (
            <button className={styles.cancelBtn} onClick={handleCancel}>
              {t("run.stop")}
            </button>
          )}
        </div>
      </div>

      <div className={styles.resultPanel}>
        <div className={styles.resultHeader}>
          <span>{t("run.result")}</span>
          <div className={styles.resultMeta}>
            {resultStatusIcon && (
              <span className={styles.statusIcon}>{resultStatusIcon}</span>
            )}
            {lastResult && (
              <span className={`${styles.resultBadge} ${lastResult.ok ? styles.ok : styles.err}`}>
                {lastResult.ok ? t("run.success") : t("run.fail")}
                <span className={styles.duration}> {lastResult.durationMs}ms</span>
              </span>
            )}
          </div>
        </div>
        <pre className={styles.resultBody}>
          {isRunning
            ? t("run.running")
            : lastResult
            ? JSON.stringify(lastResult.ok ? lastResult.data : lastResult.error, null, 2)
            : t("run.viewResult")}
        </pre>
        {lastResult && !isRunning && (
          <div className={styles.resultActions}>
            <button className={styles.copyBtn} onClick={handleCopyResult}>
              {copied ? t("run.copied") : t("run.copyJson")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}