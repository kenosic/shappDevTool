import React, { useState, useCallback, useRef, useEffect } from "react";
import Titlebar from "../components/Titlebar/Titlebar";
import TabBar from "../components/TabBar/TabBar";
import StatusBar from "../components/StatusBar/StatusBar";
import PreviewTab from "../components/tabs/PreviewTab";
import LogTab from "../components/tabs/LogTab";
import DbTab from "../components/tabs/DbTab";
import IssuesTab from "../components/tabs/IssuesTab";
import LeftPanel from "../components/LeftPanel/LeftPanel";
import SettingsModal from "../components/modals/SettingsModal";
import AboutModal from "../components/modals/AboutModal";
import AgentPanel from "../components/AgentPanel/AgentPanel";
import { usePackageStore } from "../stores/packageStore";
import { useAgentStore } from "../stores/agentStore";
import { useToastStore } from "../stores/toastStore";
import { useLogStore } from "../stores/logStore";
import { useT } from "../i18n";
import { useAutoCommit } from "../hooks/useAutoCommit";
import styles from "./MainLayout.module.css";

export type TabId = "preview" | "issues" | "log" | "db";

const TAB_IDS: TabId[] = ["preview", "issues", "log", "db"];

export default function MainLayout() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<TabId>("preview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(true);
  const [leftWidth, setLeftWidth] = useState(290);
  const [bottomHeight, setBottomHeight] = useState(200);

  // ── Left panel drag resize ──────────────────────────────────
  const leftDragging = useRef(false);
  const leftStartX = useRef(0);
  const leftStartW = useRef(0);

  const onLeftMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    leftDragging.current = true;
    leftStartX.current = e.clientX;
    leftStartW.current = leftWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [leftWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!leftDragging.current) return;
      const delta = e.clientX - leftStartX.current;
      setLeftWidth(Math.max(200, leftStartW.current + delta));
    };
    const onUp = () => {
      if (!leftDragging.current) return;
      leftDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Bottom panel drag resize ────────────────────────────────
  const bottomDragging = useRef(false);
  const bottomStartY = useRef(0);
  const bottomStartH = useRef(0);

  const onBottomMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    bottomDragging.current = true;
    bottomStartY.current = e.clientY;
    bottomStartH.current = bottomHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [bottomHeight]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!bottomDragging.current) return;
      const delta = bottomStartY.current - e.clientY;
      const newH = Math.max(80, Math.min(600, bottomStartH.current + delta));
      setBottomHeight(newH);
      if (newH <= 80) setBottomCollapsed(true);
      else if (bottomCollapsed && newH > 80) setBottomCollapsed(false);
    };
    const onUp = () => {
      if (!bottomDragging.current) return;
      bottomDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [bottomCollapsed]);
  const setCurrent = usePackageStore((s) => s.setCurrent);
  const setRecentFolders = usePackageStore((s) => s.setRecentFolders);
  const current = usePackageStore((s) => s.current);
  const agentPanelVisible = useAgentStore((s) => s.panelVisible);
  const toggleAgentPanel = useAgentStore((s) => s.togglePanel);
  const showToast = useToastStore((s) => s.show);
  const logErrorCount = useLogStore((s) => s.entries.filter((e) => "level" in e && e.level === "error").length);
  const issueCount = usePackageStore((s) => s.current?.warnings?.length ?? 0);

  // Enable auto-commit when agent generates code
  useAutoCommit();

  const handleReload = useCallback(async () => {
    if (!current) return;
    try {
      const result = await window.devtool.package.loadFolder(current.dir);
      setCurrent(result);
    } catch {
      // ignore
    }
  }, [current, setCurrent]);

  const handleOpenFolder = useCallback(async () => {
    setRecentFolders(await window.devtool.package.getRecent());
  }, [setRecentFolders]);

  const handleBuild = useCallback(async () => {
    if (!current) return;
    try {
      const result = await window.devtool.package.build(current.dir);
      if (result) {
        showToast(t("menu.buildSuccess", { path: result.outputPath }), "success");
        window.devtool.shell.showItemInFolder(result.outputPath);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      showToast(raw.replace(/^Error invoking remote method '[^']+': Error: /, "") || t("menu.buildFailed"), "error");
    }
  }, [current, showToast, t]);

  return (
    <div className={styles.root}>
      <Titlebar
        onOpenFolder={handleOpenFolder}
        onReload={handleReload}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
        onBuild={handleBuild}
        agentPanelVisible={agentPanelVisible}
        onToggleAgentPanel={toggleAgentPanel}
      />
      <div className={styles.body}>
        <LeftPanel width={leftWidth} />
        <div className={styles.leftResizeHandle} onMouseDown={onLeftMouseDown} />
        <div className={styles.content}>
          {/* 模拟器区域 — 始终显示 */}
          <div className={styles.previewArea}>
            <PreviewTab />
          </div>
          <div className={styles.bottomResizeHandle} onMouseDown={onBottomMouseDown} />
          {/* 底部标签页 */}
          <TabBar
            tabs={TAB_IDS.filter((id) => id !== "preview").map((id) => ({
              id,
              label: t(`tabs.${id}`),
              badge: id === "issues" ? issueCount : id === "log" ? logErrorCount : undefined,
            }))}
            activeTab={activeTab}
            onTabChange={(id) => { setActiveTab(id as TabId); setBottomCollapsed(false); }}
            collapsed={bottomCollapsed}
            onToggleCollapse={() => setBottomCollapsed((v) => !v)}
          />
          <div className={bottomCollapsed ? styles.tabContentCollapsed : styles.tabContent} style={{ height: bottomCollapsed ? 0 : bottomHeight }}>
            <div style={{ display: activeTab === "issues" ? "flex" : "none", width: "100%", height: "100%" }}>
              <IssuesTab />
            </div>
            <div style={{ display: activeTab === "log" ? "flex" : "none", width: "100%", height: "100%" }}>
              <LogTab />
            </div>
            <div style={{ display: activeTab === "db" ? "flex" : "none", width: "100%", height: "100%" }}>
              <DbTab />
            </div>
          </div>
        </div>
        <AgentPanel visible={agentPanelVisible} />
      </div>
      <StatusBar />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
