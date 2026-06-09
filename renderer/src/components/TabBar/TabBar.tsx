import React from "react";
import styles from "./TabBar.module.css";

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
};

export default function TabBar({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tab} ${activeTab === tab.id ? styles.active : ""}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
