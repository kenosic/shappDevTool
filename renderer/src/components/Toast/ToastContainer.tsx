import React, { useEffect, useState } from "react";
import { useToastStore, type Toast } from "../../stores/toastStore";
import styles from "./ToastContainer.module.css";

const ICONS: Record<string, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`${styles.toast} ${styles[toast.type]} ${visible ? styles.visible : ""}`}
      onClick={() => dismiss(toast.id)}
    >
      <span className={styles.icon}>{ICONS[toast.type]}</span>
      <span className={styles.msg}>{toast.message}</span>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
