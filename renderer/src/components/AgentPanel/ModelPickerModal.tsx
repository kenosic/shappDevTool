import React, { useEffect, useRef, useState } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useT } from "../../i18n";
import styles from "./ModelPickerModal.module.css";

// Provider abbreviation map for icons
const PROVIDER_ABBR: Record<string, string> = {
  anthropic: "A",
  openai: "O",
  google: "G",
  "github-copilot": "GH",
  githubcopilot: "GH",
  openrouter: "<",
  mistral: "M",
  groq: "Gq",
  xai: "X",
};

function providerAbbr(id: string, name: string): string {
  const key = id.toLowerCase().replace(/[\s-]/g, "");
  if (PROVIDER_ABBR[key]) return PROVIDER_ABBR[key];
  // Use first 2 chars of name
  return (name || id).slice(0, 2).toUpperCase();
}

// Translation key for well-known provider tags
const PROVIDER_TAGS: Record<string, string> = {
  "opencode-zen": "model.recommended",
  opencodezen: "model.recommended",
  "opencode-go": "model.recommended",
  opencodego: "model.recommended",
};

function providerTagKey(id: string): string | null {
  return PROVIDER_TAGS[id.toLowerCase().replace(/[\s-]/g, "")] ?? null;
}

interface Props {
  onClose: () => void;
}

export default function ModelPickerModal({ onClose }: Props) {
  const t = useT();
  const configData = useAgentStore((s) => s.configData);
  const selectedProvider = useAgentStore((s) => s.selectedProvider);
  const selectedModel = useAgentStore((s) => s.selectedModel);
  const setModel = useAgentStore((s) => s.setModel);
  const catalogProviders = useAgentStore((s) => s.catalogProviders);
  const catalogLoading = useAgentStore((s) => s.catalogLoading);
  const loadCatalog = useAgentStore((s) => s.loadCatalog);
  const addProviderKey = useAgentStore((s) => s.addProviderKey);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Local UI state for the catalog section
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keyInputFor, setKeyInputFor] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Load the provider catalog when the modal opens
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSelect = (providerId: string, modelId: string) => {
    setModel(providerId, modelId);
    onClose();
  };

  const openKeyInput = (providerId: string) => {
    setKeyInputFor(providerId);
    setKeyValue("");
    setExpanded(null);
  };

  const handleSaveKey = async (providerId: string) => {
    const key = keyValue.trim();
    if (!key) return;
    setSaving(true);
    try {
      await addProviderKey(providerId, key);
      setKeyInputFor(null);
      setKeyValue("");
      // Auto-expand the now-connected provider so its models show.
      setExpanded(providerId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>{t("model.title")}</span>
          <button className={styles.closeBtn} onClick={onClose} title={t("common.close")}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Free models section */}
          {configData && configData.freeModels.length > 0 && (
            <>
              <div className={styles.sectionLabel}>{t("model.freeModels")}</div>
              {configData.freeModels.map((m) => {
                const isActive = selectedProvider === m.providerId && selectedModel === m.id;
                return (
                  <button
                    key={`${m.providerId}::${m.id}`}
                    className={`${styles.modelItem} ${isActive ? styles.active : ""}`}
                    onClick={() => handleSelect(m.providerId, m.id)}
                  >
                    <span className={styles.modelName}>{m.name}</span>
                    <span className={styles.freeBadge}>{t("model.free")}</span>
                    {isActive && (
                      <span className={styles.checkmark}>
                        <CheckIcon />
                      </span>
                    )}
                  </button>
                );
              })}
              <div className={styles.divider} />
            </>
          )}

          {/* Provider catalog section */}
          <div className={styles.sectionLabel}>{t("model.addMore")}</div>

          {catalogLoading && catalogProviders.length === 0 && (
            <div className={styles.catalogLoading}>{t("model.loadingProviders")}</div>
          )}

          {catalogProviders.map((p) => {
            const tag = providerTagKey(p.id);
            const abbr = providerAbbr(p.id, p.name);
            const isExpanded = expanded === p.id;
            const isKeyInput = keyInputFor === p.id;

            return (
              <div key={p.id} className={styles.providerBlock}>
                <button
                  className={styles.providerItem}
                  onClick={() => {
                    if (p.connected) {
                      setExpanded(isExpanded ? null : p.id);
                    } else {
                      openKeyInput(p.id);
                    }
                  }}
                >
                  <span className={styles.providerIcon}>{abbr}</span>
                  <span className={styles.providerName}>{p.name}</span>
                  {tag && <span className={styles.providerTag}>{t(tag)}</span>}
                  {p.connected ? (
                    <span className={styles.connectedBadge}>{t("model.connected")}</span>
                  ) : (
                    <span className={styles.providerAddBtn}>+</span>
                  )}
                </button>

                {/* Inline API key input for un-connected providers */}
                {isKeyInput && (
                  <div className={styles.keyInputRow}>
                    <input
                      className={styles.keyInput}
                      type="password"
                      autoFocus
                      placeholder={p.env[0] ? t("model.enterEnv", { env: p.env[0] }) : t("model.enterApiKey")}
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveKey(p.id);
                        if (e.key === "Escape") setKeyInputFor(null);
                      }}
                    />
                    <button
                      className={styles.keySaveBtn}
                      disabled={saving || !keyValue.trim()}
                      onClick={() => handleSaveKey(p.id)}
                    >
                      {saving ? "…" : t("common.save")}
                    </button>
                    <button
                      className={styles.keyCancelBtn}
                      onClick={() => setKeyInputFor(null)}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                )}

                {/* Expanded model list for connected providers */}
                {isExpanded && p.connected && (
                  <div className={styles.modelSubList}>
                    {p.models.length === 0 && (
                      <div className={styles.catalogLoading}>{t("model.noModels")}</div>
                    )}
                    {p.models.map((m) => {
                      const isActive = selectedProvider === p.id && selectedModel === m.id;
                      return (
                        <button
                          key={m.id}
                          className={`${styles.modelItem} ${isActive ? styles.active : ""}`}
                          onClick={() => handleSelect(p.id, m.id)}
                        >
                          <span className={styles.modelName}>{m.name}</span>
                          {isActive && (
                            <span className={styles.checkmark}>
                              <CheckIcon />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Fallback while loading */}
          {!configData && catalogProviders.length === 0 && !catalogLoading && (
            <div style={{ padding: "24px 16px", color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
              {t("common.loading")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
