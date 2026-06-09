import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePackageStore } from "../../stores/packageStore";
import { useT } from "../../i18n";
import styles from "./DbTab.module.css";

type KvEntry = { key: string; value: string; updatedAt: number };

type EditState = { key: string; value: string; isNew: boolean };

function formatValue(raw: string, maxLen = 60): string {
  try {
    const parsed = JSON.parse(raw);
    const s = JSON.stringify(parsed);
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch {
    return raw.length > maxLen ? raw.slice(0, maxLen) + "…" : raw;
  }
}

function totalBytes(entries: KvEntry[]): string {
  const bytes = entries.reduce((sum, e) => sum + e.key.length + e.value.length, 0);
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function DbTab() {
  const t = useT();
  const pkg = usePackageStore((s) => s.current);
  const dbPath = pkg ? `${pkg.dir}/.devtool/state.db` : null;

  const [entries, setEntries] = useState<KvEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const editValueRef = useRef<HTMLTextAreaElement>(null);

  const loadEntries = useCallback(async () => {
    if (!dbPath) { setEntries([]); return; }
    const data = await window.devtool.kv.getAllEntries(dbPath);
    setEntries(data);
  }, [dbPath]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const visible = entries.filter((e) =>
    filter ? e.key.toLowerCase().includes(filter.toLowerCase()) : true
  );

  function openEdit(entry: KvEntry) {
    setEditState({ key: entry.key, value: entry.value, isNew: false });
    setEditError(null);
  }

  function openNew() {
    setEditState({ key: "", value: '""', isNew: true });
    setEditError(null);
  }

  function closeEdit() {
    setEditState(null);
    setEditError(null);
  }

  async function handleSave() {
    if (!dbPath || !editState) return;
    try {
      JSON.parse(editState.value);
    } catch {
      setEditError(t("common.jsonError"));
      return;
    }
    if (!editState.key.trim()) {
      setEditError(t("db.keyEmpty"));
      return;
    }
    if (editState.isNew && entries.find((e) => e.key === editState.key)) {
      setEditError(t("db.keyExists"));
      return;
    }
    await window.devtool.kv.setEntry(dbPath, editState.key.trim(), editState.value);
    closeEdit();
    loadEntries();
  }

  async function handleDelete(key: string) {
    if (!dbPath) return;
    await window.devtool.kv.deleteEntry(dbPath, key);
    loadEntries();
  }

  async function handleClearAll() {
    if (!dbPath) return;
    await window.devtool.kv.clearAll(dbPath);
    setConfirmClear(false);
    loadEntries();
  }

  async function handleExport() {
    const json = JSON.stringify(
      entries.map((e) => {
        try { return { key: e.key, value: JSON.parse(e.value) }; }
        catch { return { key: e.key, value: e.value }; }
      }),
      null, 2
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kv-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !dbPath) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const entries: Array<{ key: string; value: string }> = Array.isArray(data)
          ? data.map((item: { key: string; value: unknown }) => ({
              key: String(item.key),
              value: JSON.stringify(item.value),
            }))
          : Object.entries(data).map(([k, v]) => ({ key: k, value: JSON.stringify(v) }));
        await window.devtool.kv.importEntries(dbPath, entries);
        loadEntries();
      } catch {
        // ignore parse errors silently
      }
    };
    input.click();
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <input
          className={styles.filterInput}
          placeholder={t("db.filterPlaceholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className={styles.addBtn} onClick={openNew} disabled={!pkg}>
          {t("db.add")}
        </button>
        <button className={styles.actionBtn} onClick={handleExport} disabled={entries.length === 0}>
          {t("db.export")}
        </button>
        <button className={styles.actionBtn} onClick={handleImport} disabled={!pkg}>
          {t("db.import")}
        </button>
        <button className={styles.iconBtn} onClick={loadEntries} title={t("common.refresh")}>
          ↺
        </button>
      </div>

      <div className={styles.tableWrap}>
        {visible.length === 0 ? (
          <div className={styles.empty}>
            {pkg ? (filter ? t("db.noMatch") : t("db.empty")) : t("db.openFirst")}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colKey}>{t("db.colKey")}</th>
                <th className={styles.colValue}>{t("db.colValue")}</th>
                <th className={styles.colActions}>{t("db.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry, idx) => (
                <tr key={entry.key} className={idx % 2 === 1 ? styles.rowAlt : ""}>
                  <td className={styles.cellKey} title={entry.key}>
                    <span className={styles.keyText}>{entry.key}</span>
                  </td>
                  <td className={styles.cellValue} title={entry.value}>
                    <span className={styles.valuePreview}>{formatValue(entry.value)}</span>
                  </td>
                  <td className={styles.cellActions}>
                    <button className={styles.rowBtn} onClick={() => openEdit(entry)} title={t("common.edit")}>
                      ✏
                    </button>
                    <button
                      className={`${styles.rowBtn} ${styles.deleteBtn}`}
                      onClick={() => handleDelete(entry.key)}
                      title={t("common.delete")}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerInfo}>
          {t("db.footerInfo", { count: entries.length, size: totalBytes(entries) })}
        </span>
        <button
          className={styles.clearBtn}
          onClick={() => setConfirmClear(true)}
          disabled={entries.length === 0}
        >
          {t("db.clearAll")}
        </button>
      </div>

      {editState && (
        <div className={styles.overlay} onClick={closeEdit}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>{editState.isNew ? t("db.newKv") : t("db.editKey", { key: editState.key })}</span>
              <button className={styles.modalClose} onClick={closeEdit}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {editState.isNew && (
                <div className={styles.fieldRow}>
                  <label className={styles.fieldLabel}>{t("db.colKey")}</label>
                  <input
                    className={styles.fieldInput}
                    autoFocus
                    placeholder="my_key"
                    value={editState.key}
                    onChange={(e) => setEditState({ ...editState, key: e.target.value })}
                  />
                </div>
              )}
              {!editState.isNew && (
                <div className={styles.fieldRow}>
                  <label className={styles.fieldLabel}>{t("db.colKey")}</label>
                  <span className={styles.fieldReadonly}>{editState.key}</span>
                </div>
              )}
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>{t("db.valueJson")}</label>
                <textarea
                  ref={editValueRef}
                  className={`${styles.fieldTextarea} ${editError ? styles.fieldError : ""}`}
                  value={editState.value}
                  onChange={(e) => {
                    setEditState({ ...editState, value: e.target.value });
                    setEditError(null);
                    try { JSON.parse(e.target.value); setEditError(null); }
                    catch { setEditError(t("common.jsonError")); }
                  }}
                  rows={6}
                  spellCheck={false}
                />
              </div>
              {editError && <div className={styles.errorMsg}>{editError}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelModalBtn} onClick={closeEdit}>{t("common.cancel")}</button>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={!!editError}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmClear && (
        <div className={styles.overlay} onClick={() => setConfirmClear(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>{t("db.confirmClear")}</span>
              <button className={styles.modalClose} onClick={() => setConfirmClear(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.confirmText}>
                {t("db.confirmClearText", { count: entries.length })}
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelModalBtn} onClick={() => setConfirmClear(false)}>{t("common.cancel")}</button>
              <button className={styles.dangerBtn} onClick={handleClearAll}>{t("db.confirmClear")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}