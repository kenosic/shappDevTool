import React, { useState, useCallback, useRef, useEffect } from "react";
import { usePackageStore } from "../../stores/packageStore";
import { useExecutionStore } from "../../stores/executionStore";
import { useLogStore } from "../../stores/logStore";
import { useToastStore } from "../../stores/toastStore";
import { useT } from "../../i18n";
import styles from "./Titlebar.module.css";
import logoPng from "../../../../resources/logo.png";

interface TitlebarProps {
  onOpenFolder: () => void;
  onReload: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onBuild: () => void;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
  agentPanelVisible?: boolean;
  onToggleAgentPanel?: () => void;
}

type MenuId = "file" | "view" | "run" | "help";

export default function Titlebar({
  onOpenFolder,
  onReload,
  onOpenSettings,
  onOpenAbout,
  onBuild,
  sidebarVisible = true,
  onToggleSidebar,
  agentPanelVisible = false,
  onToggleAgentPanel,
}: TitlebarProps) {
  const t = useT();
  const isMac = navigator.platform.startsWith("Mac");
  const pkg = usePackageStore((s) => s.current);
  const setCurrent = usePackageStore((s) => s.setCurrent);
  const recentFolders = usePackageStore((s) => s.recentFolders);
  const status = useExecutionStore((s) => s.status);
  const selectedEntry = useExecutionStore((s) => s.selectedEntry);
  const method = useExecutionStore((s) => s.method);
  const rawParams = useExecutionStore((s) => s.rawParams);
  const mockContext = useExecutionStore((s) => s.mockContext);
  const setSelectedEntry = useExecutionStore((s) => s.setSelectedEntry);
  const setStatus = useExecutionStore((s) => s.setStatus);
  const setResult = useExecutionStore((s) => s.setResult);
  const appendSeparator = useLogStore((s) => s.appendSeparator);
  const showToast = useToastStore((s) => s.show);

  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);

  const entries = pkg?.entries ?? [];
  const activeEntry = selectedEntry || entries[0] || "";
  const activeEntryName = activeEntry.split("/").pop()?.replace(/\.[^.]+$/, "") ?? activeEntry;
  const isRunning = status === "running";
  const appName = pkg?.manifest.name ?? t("titlebar.unnamed");

  // Close menus / command center on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) setOpenMenu(null);
      if (commandRef.current && !commandRef.current.contains(e.target as Node)) setCommandOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleRun = useCallback(async () => {
    if (!pkg) return;
    const entryFile = activeEntry;
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
      const result = await window.devtool.execution.run({ appDir: pkg.dir, entryFile, method: method || "", params, mockContext });
      setStatus(result.ok ? "idle" : "error");
      setResult(result);
    } catch {
      setStatus("error");
    }
  }, [pkg, activeEntry, method, rawParams, mockContext]);

  const handleStop = useCallback(() => window.devtool.execution.cancel(), []);

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
      showToast(raw.replace(/^Error invoking remote method '[^']+': Error: /, "") || t("common.openFolderFailed"), "error");
    }
  }, [onOpenFolder, setCurrent, showToast]);

  const handleOpenRecent = useCallback(
    async (dir: string) => {
      setOpenMenu(null);
      setCommandOpen(false);
      try {
        const result = await window.devtool.package.loadFolder(dir);
        setCurrent(result);
        showToast(t("titlebar.switchedTo", { name: result.manifest.name ?? dir }), "success");
      } catch {
        showToast(t("common.loadFailed"), "error");
      }
    },
    [setCurrent, showToast]
  );

  // ── menu definitions ──
  const runMenuItem = (fn: () => void) => () => {
    setOpenMenu(null);
    fn();
  };

  const menus: { id: MenuId; label: string; items: React.ReactNode }[] = [
    {
      id: "file",
      label: t("menu.file"),
      items: (
        <>
          <MenuItem icon={<FolderIcon />} label={t("menu.openFolder")} onClick={runMenuItem(handleOpenFolderWithReload)} />
          {recentFolders.length > 0 && (
            <>
              <MenuSep />
              <MenuLabel>{t("titlebar.recentOpen")}</MenuLabel>
              {recentFolders.slice(0, 6).map((dir) => (
                <MenuItem key={dir} icon={<FolderSmIcon />} label={dir.split(/[\\/]/).pop() ?? dir} onClick={() => handleOpenRecent(dir)} />
              ))}
            </>
          )}
          <MenuSep />
          <MenuItem icon={<PackageIcon />} label={t("menu.build")} onClick={runMenuItem(onBuild)} disabled={!pkg} />
          <MenuSep />
          <MenuItem icon={<SettingsIcon />} label={t("menu.settings")} onClick={runMenuItem(onOpenSettings)} />
          <MenuSep />
          <MenuItem label={t("menu.exit")} onClick={runMenuItem(() => window.devtool.window.close())} />
        </>
      ),
    },
    {
      id: "view",
      label: t("menu.view"),
      items: (
        <>
          <MenuItem icon={<SidebarIcon />} label={t("menu.toggleSidebar")} checked={sidebarVisible} onClick={runMenuItem(() => onToggleSidebar?.())} />
          <MenuItem icon={<AgentIcon />} label={t("menu.toggleAgent")} checked={agentPanelVisible} onClick={runMenuItem(() => onToggleAgentPanel?.())} />
        </>
      ),
    },
    {
      id: "run",
      label: t("menu.run"),
      items: (
        <>
          {isRunning ? (
            <MenuItem icon={<StopIcon />} label={t("menu.stopApp")} onClick={runMenuItem(handleStop)} />
          ) : (
            <MenuItem icon={<RunIcon />} label={t("menu.runApp")} onClick={runMenuItem(handleRun)} disabled={!pkg} />
          )}
          <MenuItem icon={<ReloadIcon />} label={t("menu.reload")} onClick={runMenuItem(onReload)} disabled={!pkg} />
          <MenuSep />
          <MenuLabel>{t("sidebar.entryPoints")}</MenuLabel>
          {entries.length > 0 ? (
            entries.map((e) => {
              const name = e.split("/").pop()?.replace(/\.[^.]+$/, "") ?? e;
              return (
                <MenuItem
                  key={e}
                  icon={<EntryDot active={activeEntry === e} />}
                  label={name}
                  checked={activeEntry === e}
                  onClick={runMenuItem(() => setSelectedEntry(e))}
                />
              );
            })
          ) : (
            <MenuEmpty>{t("menu.noEntries")}</MenuEmpty>
          )}
        </>
      ),
    },
    {
      id: "help",
      label: t("menu.help"),
      items: (
        <>
          <MenuItem label={t("menu.about")} onClick={runMenuItem(onOpenAbout)} />
        </>
      ),
    },
  ];

  return (
    <div className={styles.titlebar}>
      {/* macOS left padding for traffic lights */}
      {isMac && <div className={styles.macSpacer} />}

      {/* App icon */}
      <div className={styles.appIcon}>
        <img className={styles.appIconImg} src={logoPng} alt="Shapp" />
      </div>

      {/* Menu bar */}
      <div className={styles.menuBar} ref={menuBarRef}>
        {menus.map((m) => (
          <div key={m.id} className={styles.menuRoot}>
            <button
              className={`${styles.menuBtn} ${openMenu === m.id ? styles.menuBtnActive : ""}`}
              onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
              onMouseEnter={() => openMenu && setOpenMenu(m.id)}
            >
              {m.label}
            </button>
            {openMenu === m.id && <div className={styles.menu}>{m.items}</div>}
          </div>
        ))}
      </div>

      {/* Left drag region */}
      <div className={styles.dragRegion} data-drag-region />

      {/* Command Center (center) */}
      <div className={styles.commandWrap} ref={commandRef}>
        <button className={styles.commandCenter} onClick={() => setCommandOpen((v) => !v)} title={t("titlebar.commandHint")}>
          <span className={`${styles.statusDot} ${isRunning ? styles.dotRunning : styles.dotReady}`} />
          <SearchIcon />
          {pkg ? (
            <span className={styles.commandText}>
              <span className={styles.commandName}>{appName}</span>
              <span className={styles.commandEntry}>· {activeEntryName}</span>
            </span>
          ) : (
            <span className={styles.commandHint}>{t("titlebar.commandHint")}</span>
          )}
        </button>
        {commandOpen && (
          <div className={styles.commandMenu}>
            <MenuLabel>{t("titlebar.recentOpen")}</MenuLabel>
            {recentFolders.length > 0 ? (
              recentFolders.slice(0, 6).map((dir) => (
                <MenuItem key={dir} icon={<FolderSmIcon />} label={dir.split(/[\\/]/).pop() ?? dir} sub={dir} onClick={() => handleOpenRecent(dir)} />
              ))
            ) : (
              <MenuEmpty>{t("titlebar.noHistory")}</MenuEmpty>
            )}
            <MenuSep />
            <MenuItem
              icon={<FolderIcon />}
              label={t("menu.openFolder")}
              onClick={() => {
                setCommandOpen(false);
                handleOpenFolderWithReload();
              }}
            />
          </div>
        )}
      </div>

      {/* Right drag region */}
      <div className={styles.dragRegion} data-drag-region />

      {/* Layout toggles */}
      <div className={styles.layoutControls}>
        <button
          className={`${styles.iconBtn} ${sidebarVisible ? styles.iconBtnActive : ""}`}
          onClick={onToggleSidebar}
          title={sidebarVisible ? t("titlebar.hideSidebar") : t("titlebar.showSidebar")}
        >
          <SidebarIcon />
        </button>
        <button
          className={`${styles.iconBtn} ${agentPanelVisible ? styles.iconBtnActive : ""}`}
          onClick={onToggleAgentPanel}
          title={agentPanelVisible ? t("titlebar.hideAgent") : t("titlebar.showAgent")}
        >
          <SecondarySidebarIcon />
        </button>
      </div>

      {/* Windows controls — far right */}
      {!isMac && (
        <div className={styles.winControls}>
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
  );
}

/* ── menu primitives ── */
function MenuItem({
  icon,
  label,
  sub,
  checked,
  disabled,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  sub?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`${styles.menuItem} ${checked ? styles.menuItemChecked : ""}`} onClick={onClick} disabled={disabled}>
      <span className={styles.menuItemIcon}>{checked ? <CheckIcon /> : icon}</span>
      <span className={styles.menuItemLabel}>{label}</span>
      {sub && <span className={styles.menuItemSub}>{sub}</span>}
    </button>
  );
}
function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className={styles.menuLabel}>{children}</div>;
}
function MenuSep() {
  return <div className={styles.menuSep} />;
}
function MenuEmpty({ children }: { children: React.ReactNode }) {
  return <div className={styles.menuEmpty}>{children}</div>;
}

/* ── icons ── */
function EntryDot({ active }: { active: boolean }) {
  return (
    <span
      style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "var(--color-success)" : "var(--text-tertiary)", flexShrink: 0, display: "inline-block" }}
    />
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
      <path d="M12 7A5 5 0 112 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 4V7H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
function FolderSmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M1 3C1 2.45 1.45 2 2 2H4.5L5.5 3H10C10.55 3 11 3.45 11 4V9C11 9.55 10.55 10 10 10H2C1.45 10 1 9.55 1 9V3Z"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinejoin="round"
      />
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
function DevToolsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M4.5 5L6.5 7L4.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7.5" y1="9" x2="10" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2.5 6.8L5 9.3L10.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MinimizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
    </svg>
  );
}
function MaximizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="7.8" y1="7.8" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function SidebarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="5" y1="1" x2="5" y2="13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function SecondarySidebarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="9" y1="1" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function AgentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5.5" cy="5" r="0.7" fill="currentColor" />
      <circle cx="8.5" cy="5" r="0.7" fill="currentColor" />
      <path d="M5 7.5c.5.8 3.5.8 4 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M3.5 8.5C2 9.5 1.5 11 1.5 12.5h11c0-1.5-.5-3-2-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PackageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="4" width="11" height="8.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M5 4V2.5A1.5 1.5 0 019 2.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <line x1="1.5" y1="7" x2="12.5" y2="7" stroke="currentColor" strokeWidth="1.2" />
      <line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
