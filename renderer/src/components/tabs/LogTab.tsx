import React, { useRef, useEffect, useState, useCallback } from "react";
import { useLogStore, type UiLogEntry } from "../../stores/logStore";
import { useT } from "../../i18n";
import styles from "./LogTab.module.css";

const LEVEL_COLORS: Record<string, string> = {
  log: "var(--text-secondary)",
  info: "var(--color-primary)",
  warn: "var(--color-warning)",
  error: "var(--color-danger)",
};

function tryParseJson(msg: string): { text: string; json?: unknown } {
  const trimmed = msg.trim();
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 2) {
    try {
      return { text: trimmed, json: JSON.parse(trimmed) };
    } catch {
      // not json
    }
  }
  return { text: msg };
}

function LogRow({ entry }: { entry: UiLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  if (entry.uiType === "separator") {
    return (
      <div className={styles.separator}>
        <span className={styles.separatorLine} />
        <span className={styles.separatorLabel}>{entry.label}</span>
        <span className={styles.separatorLine} />
      </div>
    );
  }

  const level = entry.level ?? "log";
  const { text, json } = tryParseJson(entry.message);
  const hasJson = json !== undefined;

  return (
    <div className={styles.logLine}>
      <span className={styles.ts}>{new Date(entry.ts).toISOString().slice(11, 23)}</span>
      <span className={styles.level} style={{ color: LEVEL_COLORS[level] }}>
        {level.toUpperCase().padEnd(5)}
      </span>
      {hasJson ? (
        <span className={styles.msgWrap}>
          <button className={styles.expandBtn} onClick={() => setExpanded(!expanded)}>
            {expanded ? "▼" : "▶"}
          </button>
          {expanded ? (
            <pre className={styles.jsonBlock}>{JSON.stringify(json, null, 2)}</pre>
          ) : (
            <span className={styles.msg} title={text}>
              {text.slice(0, 120)}{text.length > 120 ? "…" : ""}
            </span>
          )}
        </span>
      ) : (
        <span className={styles.msg}>{entry.message}</span>
      )}
    </div>
  );
}

export default function LogTab() {
  const t = useT();
  const entries = useLogStore((s) => s.entries);
  const filter = useLogStore((s) => s.filter);
  const search = useLogStore((s) => s.search);
  const setFilter = useLogStore((s) => s.setFilter);
  const setSearch = useLogStore((s) => s.setSearch);
  const clear = useLogStore((s) => s.clear);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, autoScroll]);

  const visible = entries.filter((e) => {
    if (e.uiType === "separator") return true;
    if (filter !== "all" && e.level !== filter) return false;
    if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSave = useCallback(async () => {
    const text = entries
      .filter((e) => e.uiType !== "separator")
      .map((e) => {
        if (e.uiType === "separator") return `--- ${e.label} ---`;
        const ts = new Date(e.ts).toISOString().slice(11, 23);
        return `[${ts}] [${e.level?.toUpperCase() ?? "LOG"}] ${e.message}`;
      })
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devtool-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(["all", "info", "warn", "error"] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.active : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? t("log.all") : f.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          className={styles.searchInput}
          type="search"
          placeholder={t("log.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.spacer} />
        <label className={styles.autoScrollLabel}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          {t("log.lockBottom")}
        </label>
        <button className={styles.actionBtn} onClick={handleSave} title={t("log.saveTitle")}>
          {t("log.save")}
        </button>
        <button className={styles.actionBtn} onClick={clear} title={t("log.clearTitle")}>
          {t("log.clear")}
        </button>
      </div>
      <div className={styles.logArea}>
        {visible.length === 0 ? (
          <div className={styles.empty}>{t("log.empty")}</div>
        ) : (
          visible.map((entry, i) => <LogRow key={i} entry={entry} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
