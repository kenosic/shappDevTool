import React, { useState } from "react";
import type { CaptureParams } from "../../types/ipc";
import { useT } from "../../i18n";
import styles from "./CapturePanel.module.css";

type Props = {
  data: string;
  mimeType: "image/png" | "video/webm";
  filename: string;
  appDir: string;
  onClose: () => void;
};

type SaveRole = "cover" | "carousel" | "logo" | "none";

export default function CapturePanel({ data, mimeType, filename, appDir, onClose }: Props) {
  const t = useT();
  const [role, setRole] = useState<SaveRole>("none");
  const [customName, setCustomName] = useState(filename);
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const isImage = mimeType === "image/png";

  async function handleSave() {
    setSaving(true);
    try {
      const params: CaptureParams = {
        data,
        mimeType,
        filename: role === "none" ? customName : filename,
        role,
        appDir,
      };
      const path = await window.devtool.capture.saveMedia(params);
      setSavedPath(path);
    } catch (err) {
      console.error(t("capture.saveFailed"), err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span>{isImage ? t("capture.saveImage") : t("capture.saveVideo")}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.preview}>
          {isImage ? (
            <img src={data} alt={t("capture.previewAlt")} className={styles.previewImg} />
          ) : (
            <video src={data} controls className={styles.previewVideo} />
          )}
        </div>

        <div className={styles.body}>
          {isImage && (
            <div className={styles.roleGroup}>
              <span className={styles.roleLabel}>{t("capture.purpose")}</span>
              {(["cover", "carousel", "logo", "none"] as SaveRole[]).map((r) => (
                <label key={r} className={styles.roleOption}>
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                  />
                  {r === "cover" ? t("capture.cover") : r === "carousel" ? t("capture.carousel") : r === "logo" ? t("capture.logo") : t("capture.custom")}
                </label>
              ))}
            </div>
          )}

          {role === "none" && (
            <div className={styles.fileNameRow}>
              <span className={styles.fileNameLabel}>{t("capture.filename")}</span>
              <input
                className={styles.fileNameInput}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>
          )}

          {savedPath ? (
            <div className={styles.savedNote}>
              {t("capture.savedAt")}<code>{savedPath}</code>
            </div>
          ) : (
            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={onClose}>{t("common.cancel")}</button>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
