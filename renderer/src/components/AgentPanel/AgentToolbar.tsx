import React, { useState, useRef, useEffect } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useT, useI18nStore, localeTag, type Lang } from "../../i18n";
import styles from "./AgentToolbar.module.css";

export default function AgentToolbar() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const createSession = useAgentStore((s) => s.createSession);
  const newSession = useAgentStore((s) => s.newSession);
  const deleteSession = useAgentStore((s) => s.deleteSession);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);

  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNew = () => {
    newSession();
    setDropOpen(false);
  };

  const handleSelect = (id: string) => {
    setActiveSession(id);
    setDropOpen(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSession(id);
    // Keep dropdown open after deletion
  };

  return (
    <div className={styles.toolbar}>
      {/* New session */}
      <button className={styles.newBtn} onClick={handleNew} title={t("agent.newChatTitle")}>
        <PlusIcon />
        {t("agent.newChat")}
      </button>

      {/* Session selector */}
      <div className={styles.sessionDropdown} ref={dropRef}>
        <button className={styles.sessionBtn} onClick={() => setDropOpen(!dropOpen)}>
          <span className={styles.sessionLabel}>
            {(activeSession?.title) || t("agent.newChat")}
          </span>
          <ChevronIcon />
        </button>
        {dropOpen && (
          <div className={styles.dropMenu}>
            {sessions.length === 0 && (
              <div className={styles.dropItem} style={{ color: "var(--text-tertiary)", cursor: "default" }}>
                {t("agent.noHistory")}
              </div>
            )}
            {sessions.map((s) => (
              <button
                key={s.id}
                className={`${styles.dropItem} ${s.id === activeSessionId ? styles.dropItemActive : ""}`}
                onClick={() => handleSelect(s.id)}
              >
                <div className={styles.dropItemBody}>
                  <span className={styles.dropItemTitle}>{s.title || t("agent.newChat")}</span>
                  <span className={styles.dropItemTime}>{formatTime(s.createdAt, lang)}</span>
                </div>
                <div className={styles.dropItemDelete} onClick={(e) => handleDelete(e, s.id)} role="button" title={t("agent.deleteChat")}>
                  <TrashIcon />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function formatTime(ts: number, lang: Lang): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const loc = localeTag(lang);
  if (isToday) {
    return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(loc, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 3h8M5 3V2h2v1M4.5 5v4M7.5 5v4M3 3l.5 7h5L9 3H3z"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
