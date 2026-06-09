import React, { useState, useEffect } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useT } from "../../i18n";
import styles from "./AgentSettingsModal.module.css";

interface Props {
  onClose: () => void;
}

export default function AgentSettingsModal({ onClose }: Props) {
  const t = useT();
  const providers = useAgentStore((s) => s.providers);
  const selectedProvider = useAgentStore((s) => s.selectedProvider);
  const selectedModel = useAgentStore((s) => s.selectedModel);
  const setModel = useAgentStore((s) => s.setModel);

  const [providerInput, setProviderInput] = useState(selectedProvider);
  const [modelInput, setModelInput] = useState(selectedModel);
  const [apiKeyProvider, setApiKeyProvider] = useState(selectedProvider);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Close on backdrop click or Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSaveModel = () => {
    setModel(providerInput.trim() || selectedProvider, modelInput.trim() || selectedModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await window.devtool.agent.setApiKey(apiKeyProvider.trim(), apiKey.trim());
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Build model options from providers list
  const activeProvider = providers.find((p) => p.id === providerInput);

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{t("agent.settings")}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Model selection */}
          <section className={styles.section}>
            <div className={styles.sectionTitle}>{t("agentSettings.modelConfig")}</div>

            <label className={styles.label}>{t("agentSettings.providerId")}</label>
            {providers.length > 0 ? (
              <select
                className={styles.select}
                value={providerInput}
                onChange={(e) => { setProviderInput(e.target.value); setModelInput(""); }}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || p.id}</option>
                ))}
              </select>
            ) : (
              <input
                className={styles.input}
                value={providerInput}
                onChange={(e) => setProviderInput(e.target.value)}
                placeholder="anthropic"
              />
            )}

            <label className={styles.label} style={{ marginTop: 10 }}>{t("agentSettings.modelId")}</label>
            {activeProvider && activeProvider.models.length > 0 ? (
              <select
                className={styles.select}
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
              >
                {activeProvider.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.id}</option>
                ))}
              </select>
            ) : (
              <input
                className={styles.input}
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                placeholder="claude-opus-4-5"
              />
            )}

            <button className={styles.saveBtn} onClick={handleSaveModel}>
              {saved ? t("agentSettings.saved") : t("agentSettings.saveModel")}
            </button>
          </section>

          {/* API Key */}
          <section className={styles.section}>
            <div className={styles.sectionTitle}>API Key</div>
            <div className={styles.hint}>
              {t("agentSettings.keyHint")}
            </div>

            <label className={styles.label}>{t("agentSettings.provider")}</label>
            {providers.length > 0 ? (
              <select
                className={styles.select}
                value={apiKeyProvider}
                onChange={(e) => setApiKeyProvider(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || p.id}</option>
                ))}
              </select>
            ) : (
              <input
                className={styles.input}
                value={apiKeyProvider}
                onChange={(e) => setApiKeyProvider(e.target.value)}
                placeholder="anthropic"
              />
            )}

            <label className={styles.label} style={{ marginTop: 10 }}>API Key</label>
            <input
              className={styles.input}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
            />

            <button
              className={styles.saveBtn}
              onClick={handleSaveApiKey}
              disabled={saving || !apiKey.trim()}
            >
              {saving ? t("common.saving") : saved ? t("agentSettings.saved") : t("agentSettings.saveKey")}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
