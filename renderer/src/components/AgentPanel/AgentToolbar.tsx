import React, { useState, useRef, useEffect } from "react";
import { useAgentStore } from "../../stores/agentStore";
import AgentSettingsModal from "../modals/AgentSettingsModal";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    setDropOpen(false);
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
            {activeSession?.title ?? t("agent.newChat")}
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
                  <span className={styles.dropItemTitle}>{s.title}</span>
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

      {/* Settings */}
      <button className={styles.settingsBtn} onClick={() => setSettingsOpen(true)} title={t("agent.settings")}>
        <SettingsIcon />
      </button>

      {settingsOpen && <AgentSettingsModal onClose={() => setSettingsOpen(false)} />}
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

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        d="M7.5 9.5a2 2 0 100-4 2 2 0 000 4zM12.4 8.3a5 5 0 00.1-.8 5 5 0 00-.1-.8l1.7-1.3a.4.4 0 00.1-.5l-1.6-2.7a.4.4 0 00-.5-.1l-2 .8a5.1 5.1 0 00-1.4-.8L8.4.6A.4.4 0 008 .3H4.8a.4.4 0 00-.4.3l-.3 2.1a5.1 5.1 0 00-1.4.8l-2-.8a.4.4 0 00-.5.1L.4 5.4a.4.4 0 00.1.5l1.7 1.3a5.2 5.2 0 000 1.6L.5 10.1a.4.4 0 00-.1.5l1.6 2.7a.4.4 0 00.5.1l2-.8c.4.3.9.6 1.4.8l.3 2.1c0 .2.2.3.4.3H8c.2 0 .4-.1.4-.3l.3-2.1a5 5 0 001.4-.8l2 .8c.2.1.4 0 .5-.1l1.6-2.7a.4.4 0 00-.1-.5l-1.7-1.3z"
        stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
      />
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
