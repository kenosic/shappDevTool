import React, { useState, useCallback } from "react";
import Titlebar from "../components/Titlebar/Titlebar";
import Sidebar from "../components/Sidebar/Sidebar";
import TabBar from "../components/TabBar/TabBar";
import StatusBar from "../components/StatusBar/StatusBar";
import PreviewTab from "../components/tabs/PreviewTab";
import LogTab from "../components/tabs/LogTab";
import DbTab from "../components/tabs/DbTab";
import SettingsModal from "../components/modals/SettingsModal";
import AboutModal from "../components/modals/AboutModal";
import AgentPanel from "../components/AgentPanel/AgentPanel";
import { usePackageStore } from "../stores/packageStore";
import { useAgentStore } from "../stores/agentStore";
import { useToastStore } from "../stores/toastStore";
import { useT } from "../i18n";
import styles from "./MainLayout.module.css";

export type TabId = "preview" | "log" | "db";

const TAB_IDS: TabId[] = ["preview", "log", "db"];

export default function MainLayout() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<TabId>("preview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const setCurrent = usePackageStore((s) => s.setCurrent);
  const setRecentFolders = usePackageStore((s) => s.setRecentFolders);
  const current = usePackageStore((s) => s.current);
  const agentPanelVisible = useAgentStore((s) => s.panelVisible);
  const toggleAgentPanel = useAgentStore((s) => s.togglePanel);
  const showToast = useToastStore((s) => s.show);

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
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible((v) => !v)}
        agentPanelVisible={agentPanelVisible}
        onToggleAgentPanel={toggleAgentPanel}
      />
      <div className={styles.body}>
        {sidebarVisible && <Sidebar />}
        <div className={styles.content}>
          <TabBar
            tabs={TAB_IDS.map((id) => ({ id, label: t(`tabs.${id}`) }))}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as TabId)}
          />
          <div className={styles.tabContent}>
            <div style={{ display: activeTab === "preview" ? "flex" : "none", height: "100%" }}>
              <PreviewTab />
            </div>
            <div style={{ display: activeTab === "log" ? "flex" : "none", height: "100%" }}>
              <LogTab />
            </div>
            <div style={{ display: activeTab === "db" ? "flex" : "none", height: "100%" }}>
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
