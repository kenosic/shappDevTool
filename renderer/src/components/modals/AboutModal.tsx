import React, { useEffect, useState } from "react";
import type { AppInfo } from "../../types/ipc";
import styles from "./AboutModal.module.css";
import logoPng from "../../../../resources/logo.png";
import { useT } from "../../i18n";

interface Props {
  onClose: () => void;
}

export default function AboutModal({ onClose }: Props) {
  const t = useT();
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    window.devtool.app.getInfo().then(setInfo);
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <img className={styles.logo} src={logoPng} alt="Shapp" />
          <div className={styles.headerText}>
            <div className={styles.appName}>{info?.name ?? "Shapp DevTool"}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        {/* Info rows */}
        <div className={styles.body}>
          {info ? (
            <>
              <InfoRow label={t("about.version")} value={info.version} />
              <InfoRow label={t("about.electron")} value={info.electron} />
              <InfoRow label={t("about.chromium")} value={info.chromium} />
              <InfoRow label={t("about.node")} value={info.node} />
              <InfoRow label={t("about.v8")} value={info.v8} />
              <InfoRow label={t("about.os")} value={info.os} />
            </>
          ) : (
            <div className={styles.loading}>{t("common.loading")}</div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.okBtn} onClick={onClose}>
            {t("about.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
