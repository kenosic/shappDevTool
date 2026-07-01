/**
 * ExtensionsTab — VS Code-compatible extension browser in the left sidebar.
 *
 * Features:
 *  - List installed extensions with search/filter
 *  - View extension details (version, publisher, commands, etc.)
 *  - Enable / disable extensions
 *  - Install from .vsix via file dialog
 *  - Drag & drop .vsix files to install
 *  - Uninstall extensions
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useExtensionStore } from "../../stores/extensionStore";
import type { VSCodeExtension } from "../../types/ipc";
import styles from "./ExtensionsTab.module.css";

// ── SVG Icons ──────────────────────────────────────────────────────

function PuzzleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.611a2.404 2.404 0 0 1-1.705.706 2.404 2.404 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.931a2.5 2.5 0 1 1-1.974-3.561 2.5 2.5 0 0 1 4.859-.597c.18.427.182.904-.02 1.33-.205.435-.549.75-.98.928a2.5 2.5 0 1 0 1.386 4.808 2.5 2.5 0 0 0-.01-4.83c.434-.18.879-.188 1.33-.02.427.18.752.549.928.98a2.5 2.5 0 1 0 4.808-1.386 2.5 2.5 0 0 0-4.829.01c.188.434.188.879-.02 1.33-.18.427-.549.752-.98.928a2.5 2.5 0 1 0-1.386-4.808 2.5 2.5 0 0 0 .01 4.829c.435.18.88.188 1.33-.02.427-.18.75-.549.928-.98a2.5 2.5 0 1 0-4.808 1.386 2.5 2.5 0 0 0 4.829-.01z"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.3-4.3"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

// ── Extension card ─────────────────────────────────────────────────

function ExtensionCard({
  ext,
  iconDataUrl,
  onClick,
}: {
  ext: VSCodeExtension;
  iconDataUrl?: string;
  onClick: () => void;
}) {
  const firstLetter = (ext.displayName || ext.name)[0]?.toUpperCase() ?? "?";

  return (
    <div
      className={ext.enabled ? styles.card : styles.cardDisabled}
      onClick={onClick}
    >
      <div className={styles.iconWrap}>
        {iconDataUrl ? (
          <img className={styles.iconImg} src={iconDataUrl} alt="" />
        ) : (
          <span className={styles.iconFallback}>{firstLetter}</span>
        )}
      </div>
      <div className={styles.info}>
        <div className={styles.infoRow}>
          <span className={styles.displayName}>{ext.displayName}</span>
          <span className={styles.version}>v{ext.version}</span>
        </div>
        <div className={styles.publisher}>{ext.publisher}</div>
        <div className={styles.description}>{ext.description}</div>
        <div className={styles.meta}>
          {ext.categories?.slice(0, 2).map((cat) => (
            <span key={cat} className={styles.badge}>{cat}</span>
          ))}
          <span className={ext.enabled ? styles.badgeEnabled : styles.badgeDisabled}>
            {ext.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Detail view ────────────────────────────────────────────────────

function ExtensionDetail({
  ext,
  iconDataUrl,
  onBack,
  onToggle,
  onUninstall,
}: {
  ext: VSCodeExtension;
  iconDataUrl?: string;
  onBack: () => void;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  const commands: Array<{ command: string; title: string }> = [];
  if (ext.contributes) {
    const c = ext.contributes as Record<string, unknown>;
    if (Array.isArray(c.commands)) {
      for (const cmd of c.commands as Array<{ command: string; title: string }>) {
        commands.push({ command: cmd.command, title: cmd.title });
      }
    }
  }

  const firstLetter = (ext.displayName || ext.name)[0]?.toUpperCase() ?? "?";

  return (
    <div className={styles.detailOverlay}>
      <div className={styles.detailHeader}>
        <button className={styles.backBtn} onClick={onBack}>
          <BackIcon />
        </button>
        <div className={styles.iconWrap}>
          {iconDataUrl ? (
            <img className={styles.iconImg} src={iconDataUrl} alt="" />
          ) : (
            <span className={styles.iconFallback}>{firstLetter}</span>
          )}
        </div>
        <div className={styles.info} style={{ flex: 1, minWidth: 0 }}>
          <span className={styles.detailTitle}>{ext.displayName}</span>
        </div>
      </div>

      <div className={styles.detailBody}>
        <div className={styles.detailSection}>
          <div className={styles.detailSectionTitle}>Details</div>
          <div className={styles.detailField}>
            <span className={styles.detailFieldLabel}>ID</span>
            <span className={styles.detailFieldValue}>{ext.id}</span>
          </div>
          <div className={styles.detailField}>
            <span className={styles.detailFieldLabel}>Version</span>
            <span className={styles.detailFieldValue}>v{ext.version}</span>
          </div>
          <div className={styles.detailField}>
            <span className={styles.detailFieldLabel}>Publisher</span>
            <span className={styles.detailFieldValue}>{ext.publisher}</span>
          </div>
          {ext.engines?.vscode && (
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>VS Code</span>
              <span className={styles.detailFieldValue}>^{ext.engines.vscode}</span>
            </div>
          )}
          {ext.main && (
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Entry</span>
              <span className={styles.detailFieldValue} style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{ext.main}</span>
            </div>
          )}
        </div>

        {ext.description && (
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Description</div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{ext.description}</p>
          </div>
        )}

        {commands.length > 0 && (
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Commands ({commands.length})</div>
            <div className={styles.detailCommands}>
              {commands.map((cmd) => (
                <div key={cmd.command} className={styles.detailCommand}>
                  {cmd.title} — <code>{cmd.command}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {ext.activationEvents && ext.activationEvents.length > 0 && (
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Activation Events</div>
            <div className={styles.detailCommands}>
              {ext.activationEvents.map((ev) => (
                <div key={ev} className={styles.detailCommand}><code>{ev}</code></div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={styles.detailActions}>
        <button className={styles.detailBtn} onClick={onToggle}>
          {ext.enabled ? "Disable" : "Enable"}
        </button>
        <button className={styles.detailBtnDanger} onClick={onUninstall}>
          <TrashIcon /> Uninstall
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export default function ExtensionsTab() {
  const {
    extensions,
    loading,
    searchQuery,
    icons,
    setSearchQuery,
    refresh,
    installFromDialog,
    uninstall,
    toggleEnabled,
  } = useExtensionStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Filtered extensions
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return extensions;
    const q = searchQuery.toLowerCase();
    return extensions.filter(
      (e) =>
        e.displayName.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.publisher.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.categories?.some((c) => c.toLowerCase().includes(q))
    );
  }, [extensions, searchQuery]);

  const selected = selectedId
    ? extensions.find((e) => e.id === selectedId)
    : null;

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (file.name.endsWith(".vsix")) {
          const filePath = window.devtool.fileUtils.getPathForFile(file);
          try {
            await window.devtool.extensions.install(filePath);
          } catch {
            // install error — handled silently for now
          }
        }
      }
      await refresh();
    },
    [refresh]
  );

  const handleInstallClick = useCallback(async () => {
    await installFromDialog();
  }, [installFromDialog]);

  const handleToggleEnabled = useCallback(
    async (ext: VSCodeExtension) => {
      await toggleEnabled(ext.id, !ext.enabled);
    },
    [toggleEnabled]
  );

  const handleUninstall = useCallback(
    async (ext: VSCodeExtension) => {
      await uninstall(ext.id);
      if (selectedId === ext.id) setSelectedId(null);
    },
    [uninstall, selectedId]
  );

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className={styles.dropOverlay}>
          <span className={styles.dropText}>Drop .vsix to install</span>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.title}>Extensions</div>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search extensions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={handleInstallClick}>
            <PlusIcon /> Install
          </button>
          <button className={styles.actionBtn} onClick={refresh}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading extensions...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><PuzzleIcon /></div>
          <div className={styles.emptyText}>
            {searchQuery ? "No extensions match your search" : "No extensions installed"}
          </div>
          <div className={styles.emptyHint}>
            {searchQuery
              ? "Try a different search term"
              : "Click \"Install\" to add a .vsix extension, or drag & drop a .vsix file here"}
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map((ext) => (
            <ExtensionCard
              key={ext.id}
              ext={ext}
              iconDataUrl={icons[ext.id]}
              onClick={() => setSelectedId(ext.id)}
            />
          ))}
        </div>
      )}

      {selected && (
        <ExtensionDetail
          ext={selected}
          iconDataUrl={icons[selected.id]}
          onBack={() => setSelectedId(null)}
          onToggle={() => handleToggleEnabled(selected)}
          onUninstall={() => handleUninstall(selected)}
        />
      )}
    </div>
  );
}
