/**
 * IssuesTab — 系统问题提示面板。
 * 展示项目结构校验警告（如缺失 manifest、前端目录不存在等）。
 */

import React from "react";
import { usePackageStore } from "../../stores/packageStore";
import { useT } from "../../i18n";
import styles from "./IssuesTab.module.css";

export default function IssuesTab() {
  const t = useT();
  const warnings = usePackageStore((s) => s.current?.warnings ?? []);

  if (warnings.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✅</div>
          <div>{t("issues.noIssues")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>⚠ {t("issues.title")}</span>
        <span className={styles.headerCount}>{warnings.length}</span>
      </div>
      <div className={styles.list}>
        {warnings.map((w, i) => (
          <div key={i} className={styles.item}>
            <span className={styles.itemIcon}>⚠</span>
            <span className={styles.itemText}>{w}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
