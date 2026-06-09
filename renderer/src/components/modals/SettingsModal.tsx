import React, { useState, useEffect } from "react";
import styles from "./SettingsModal.module.css";
import { useT, useI18nStore, type Lang } from "../../i18n";

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    window.devtool.theme.get().then(setTheme);
  }, []);

  async function handleThemeChange(t: "system" | "light" | "dark") {
    setTheme(t);
    await window.devtool.theme.set(t);
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span>{t("common.settings")}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Appearance */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("settings.appearance")}</h3>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t("settings.theme")}</label>
              <select
                className={styles.select}
                value={theme}
                onChange={(e) => handleThemeChange(e.target.value as "system" | "light" | "dark")}
              >
                <option value="system">{t("settings.themeSystem")}</option>
                <option value="light">{t("settings.themeLight")}</option>
                <option value="dark">{t("settings.themeDark")}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t("settings.language")}</label>
              <select
                className={styles.select}
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </section>

          {/* About */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("settings.about")}</h3>
            <div className={styles.aboutRow}>
              <span className={styles.fieldLabel}>Shapp DevTool</span>
              <span className={styles.aboutValue}>v1.0.0</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
