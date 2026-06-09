import React, { useEffect, useRef, useCallback } from "react";
import { useAgentStore } from "../../stores/agentStore";
import AgentToolbar from "./AgentToolbar";
import MessageList from "./MessageList";
import AgentInput from "./AgentInput";
import { useT } from "../../i18n";
import styles from "./AgentPanel.module.css";

function ServerStatusBanner() {
  const t = useT();
  const serverStatus = useAgentStore((s) => s.serverStatus);
  const serverError = useAgentStore((s) => s.serverError);
  const retryConnection = useAgentStore((s) => s.retryConnection);

  // Only show a banner on definitive failure; hide while unknown/checking/ready
  if (serverStatus !== "unreachable") return null;

  return (
    <div className={styles.serverBanner} data-status="error">
      <div className={styles.serverBannerTitle}>{t("agent.serverFailed")}</div>
      {serverError && (
        <pre className={styles.serverBannerCode}>{serverError}</pre>
      )}
      <button className={styles.serverBannerRetry} onClick={retryConnection}>
        {t("common.retry")}
      </button>
    </div>
  );
}

export default function AgentPanel({ visible }: { visible: boolean }) {
  const panelWidth = useAgentStore((s) => s.panelWidth);
  const setPanelWidth = useAgentStore((s) => s.setPanelWidth);
  const init = useAgentStore((s) => s.init);
  const initialized = useAgentStore((s) => s.initialized);

  // Init on first render when visible
  useEffect(() => {
    if (visible && !initialized) init();
  }, [visible, initialized, init]);

  // ── Drag-to-resize ────────────────────────────────────────────────
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      setPanelWidth(startWidth.current + delta);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setPanelWidth]);

  if (!visible) return null;

  return (
    <div
      className={styles.panel}
      style={{ width: panelWidth }}
    >
      <div className={styles.resizeHandle} onMouseDown={onMouseDown} />
      <AgentToolbar />
      <ServerStatusBanner />
      <MessageList />
      <AgentInput />
    </div>
  );
}
