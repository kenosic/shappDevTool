import React from "react";
import styles from "./TabBar.module.css";

type Tab = { id: string; label: string; badge?: number };

type Props = {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function TabBar({ tabs, activeTab, onTabChange, collapsed, onToggleCollapse }: Props) {
  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tab} ${activeTab === tab.id && !collapsed ? styles.active : ""}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
          {tab.badge != null && tab.badge > 0 && (
            <span className={styles.badge}>{tab.badge > 99 ? "99+" : tab.badge}</span>
          )}
        </button>
      ))}
      <div className={styles.spacer} />
      {onToggleCollapse && (
        <button className={styles.collapseBtn} onClick={onToggleCollapse} title={collapsed ? "展开" : "折叠"}>
          {collapsed ? "▲" : "▼"}
        </button>
      )}
    </div>
  );
}
