import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAgentStore } from "../../stores/agentStore";
import type { FileAttachment } from "../../types/ipc";
import ModelPickerModal from "./ModelPickerModal";
import { useT } from "../../i18n";
import styles from "./AgentInput.module.css";

export default function AgentInput() {
  const t = useT();
  const [text, setText] = useState("");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modeDropOpen, setModeDropOpen] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const abortStreaming = useAgentStore((s) => s.abortStreaming);
  const mode = useAgentStore((s) => s.mode);
  const setMode = useAgentStore((s) => s.setMode);
  const selectedModel = useAgentStore((s) => s.selectedModel);
  const configData = useAgentStore((s) => s.configData);
  const serverStatus = useAgentStore((s) => s.serverStatus);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeDropRef = useRef<HTMLDivElement>(null);

  // Look up display name from config data; fall back to stripping model ID
  const modelLabel = (() => {
    if (!configData || !selectedModel) return null;
    const free = configData.freeModels.find((m) => m.id === selectedModel);
    if (free) return free.name;
    for (const group of configData.providerGroups) {
      const m = group.models.find((gm) => gm.id === selectedModel);
      if (m) return m.name;
    }
    return selectedModel.split("/").pop()?.replace(/-\d{4}-\d{2}-\d{2}$/, "") ?? selectedModel;
  })();

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    autoResize();
  };

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    const filesToSend = attachments.slice();
    setText("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(trimmed, filesToSend.length > 0 ? filesToSend : undefined);
  }, [text, attachments, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Close mode dropdown on outside click
  useEffect(() => {
    if (!modeDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (modeDropRef.current && !modeDropRef.current.contains(e.target as Node))
        setModeDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modeDropOpen]);

  return (
    <div className={styles.inputArea}>
      {attachments.length > 0 && (
        <div className={styles.attachList}>
          {attachments.map((f, i) => (
            <span key={i} className={styles.attachChip}>
              <span className={styles.attachChipName}>{f.name}</span>
              <button
                className={styles.attachChipRemove}
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                title={t("common.remove")}
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Main input box */}
      <div className={styles.inputBox}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={t("agent.placeholder")}
          rows={2}
          disabled={isStreaming && text === ""}
        />
        <div className={styles.inputBoxRow}>
          <button className={styles.attachBtn} title={t("agent.attach")} onClick={async () => {
            const files = await window.devtool.agent.pickFile();
            if (files.length > 0) setAttachments((prev) => [...prev, ...files]);
          }}>
            <PlusIcon />
          </button>
          {isStreaming ? (
            <button className={styles.stopBtn} onClick={abortStreaming} title={t("agent.stopGen")}>
              <StopIcon />
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!text.trim() || serverStatus !== "ready"}
              title={t("agent.send")}
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar below the box */}
      <div className={styles.toolbar}>
        {/* Mode dropdown */}
        <div className={styles.modeDropWrap} ref={modeDropRef}>
          <button className={styles.modeDropBtn} onClick={() => setModeDropOpen((v) => !v)}>
            {mode === "build" ? "Build" : "Plan"}
            <ChevronDownIcon />
          </button>
          {modeDropOpen && (
            <div className={styles.modeDropList}>
              {(["build", "plan"] as const).map((m) => (
                <button
                  key={m}
                  className={`${styles.modeDropItem} ${mode === m ? styles.modeDropItemActive : ""}`}
                  onClick={() => { setMode(m); setModeDropOpen(false); }}
                >
                  {m === "build" ? "Build" : "Plan"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Model selector */}
        <button
          className={styles.modelBtn}
          onClick={() => setModelPickerOpen(true)}
          title={t("agent.switchModel")}
          disabled={!configData}
        >
          {modelLabel
            ? <span className={styles.modelBtnLabel}>{modelLabel}</span>
            : <span className={styles.modelBtnLoading}>…</span>}
          <ChevronDownIcon />
        </button>
      </div>

      {modelPickerOpen && (
        <ModelPickerModal onClose={() => setModelPickerOpen(false)} />
      )}
    </div>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 11.5V2.5M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2.5" y="2.5" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
