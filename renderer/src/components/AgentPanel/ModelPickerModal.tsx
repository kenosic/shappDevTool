import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useT } from "../../i18n";
import type { CatalogModel, ModelCapabilities, ModelCost, AgentCatalogProvider } from "../../types/ipc";
import ProviderConfigModal from "./ProviderConfigModal";
import styles from "./ModelPickerModal.module.css";

// ── Provider metadata ────────────────────────────────────────────

// Priority order for well-known providers (lower = shown first)
const PROVIDER_PRIORITY: Record<string, number> = {
  opencode: 0,
  "opencode-go": 0,
  opencodego: 0,
  anthropic: 1,
  openai: 1,
  google: 2,
  "github-copilot": 3,
  githubcopilot: 3,
  openrouter: 4,
  mistral: 4,
  groq: 5,
  xai: 5,
  deepseek: 5,
  meta: 6,
  codestral: 6,
  perplexity: 7,
  cohere: 8,
  cerebras: 9,
  fireworks: 10,
};

function providerPriority(id: string): number {
  const key = id.toLowerCase().replace(/[\s_-]/g, "");
  return PROVIDER_PRIORITY[key] ?? 100;
}

const PROVIDER_META: Record<string, { abbr: string; color?: string }> = {
  anthropic: { abbr: "A", color: "#d97757" },
  openai: { abbr: "O", color: "#74aa9c" },
  google: { abbr: "G", color: "#4285f4" },
  "github-copilot": { abbr: "GH", color: "#8957e5" },
  githubcopilot: { abbr: "GH", color: "#8957e5" },
  openrouter: { abbr: "<", color: "#6366f1" },
  mistral: { abbr: "M", color: "#f59e0b" },
  groq: { abbr: "Gq", color: "#ef4444" },
  xai: { abbr: "X", color: "#ffffff" },
  deepseek: { abbr: "DS", color: "#4a6cf7" },
  meta: { abbr: "Ll", color: "#0668E1" },
  perplexity: { abbr: "P", color: "#20B8CD" },
  cerebras: { abbr: "C", color: "#f97316" },
  cohere: { abbr: "Co", color: "#39594a" },
  fireworks: { abbr: "Fw", color: "#e8643f" },
};

function providerMeta(id: string) {
  const key = id.toLowerCase().replace(/[\s_-]/g, "");
  return PROVIDER_META[key] ?? { abbr: (id).slice(0, 2).toUpperCase() };
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

// ── Status badge coloring ────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  alpha: { bg: "rgba(255,149,0,0.12)", text: "#ff9500" },
  beta: { bg: "rgba(0,122,255,0.12)", text: "#007aff" },
  deprecated: { bg: "rgba(255,59,48,0.12)", text: "#ff3b30" },
  active: { bg: "transparent", text: "transparent" },
};

// ── Helpers ──────────────────────────────────────────────────────

function formatContext(limit?: { context: number }): string {
  if (!limit?.context) return "";
  if (limit.context >= 1000000) return `${(limit.context / 1000000).toFixed(1)}M`;
  if (limit.context >= 1000) return `${Math.round(limit.context / 1000)}K`;
  return `${limit.context}`;
}

function formatCost(cost?: ModelCost): string {
  if (!cost) return "";
  const parts: string[] = [];
  if (cost.input > 0) parts.push(`$${cost.input.toFixed(2)}`);
  if (cost.output > 0) parts.push(`$${cost.output.toFixed(2)}`);
  if (parts.length === 0) return "";
  return parts.join(" / ");
}

function capabilityTags(cap?: ModelCapabilities): string[] {
  if (!cap) return [];
  const tags: string[] = [];
  if (cap.reasoning) tags.push("reasoning");
  if (cap.toolcall) tags.push("tools");
  if (cap.attachment) tags.push("files");
  if (cap.input?.image || cap.input?.video) tags.push("vision");
  if (cap.input?.audio) tags.push("audio");
  return tags;
}

// ── Component ────────────────────────────────────────────────────

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
  const recentModels = useAgentStore((s) => s.recentModels);
  const overlayRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Local state ──────────────────────────────────────────────
  const [expanded, setExpanded] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [configProvider, setConfigProvider] = useState<AgentCatalogProvider | null>(null);

  // Load catalog on mount
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchQuery) { setSearchQuery(""); return; }
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, searchQuery]);

  const handleSelect = (providerId: string, modelId: string) => {
    setModel(providerId, modelId);
    onClose();
  };

  const handleConfigureProvider = (provider: AgentCatalogProvider) => {
    if (provider.connected) {
      setExpanded(expanded === provider.id ? null : provider.id);
    } else {
      setConfigProvider(provider);
    }
  };

  // ── Filter and sort models by search ──────────────────────────
  const { connectedProviders, unconnectedProviders } = useMemo(() => {
    let list = [...catalogProviders];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list
        .map((p) => ({
          ...p,
          models: p.models.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              m.id.toLowerCase().includes(q) ||
              p.name.toLowerCase().includes(q) ||
              (m.family && m.family.toLowerCase().includes(q))
          ),
        }))
        .filter((p) => p.models.length > 0);
    }
    // Sort by priority (well-known providers first), then alphabetically
    list.sort((a, b) => {
      const pa = providerPriority(a.id);
      const pb = providerPriority(b.id);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
    const connected = list.filter((p) => p.connected);
    const unconnected = list.filter((p) => !p.connected);
    return { connectedProviders: connected, unconnectedProviders: unconnected };
  }, [catalogProviders, searchQuery]);

  // Resolve recent model entries
  const recentModelEntries = useMemo(() => {
    if (recentModels.length === 0) return [];
    return recentModels
      .map((r) => {
        // Check in configData free models
        const free = configData?.freeModels.find(
          (fm) => fm.providerId === r.providerId && fm.id === r.modelId
        );
        if (free) return { providerId: r.providerId, modelId: r.modelId, name: free.name, free: true };

        // Check in catalog
        const provider = catalogProviders.find((p) => p.id === r.providerId);
        const model = provider?.models.find((m) => m.id === r.modelId);
        if (model) return { providerId: r.providerId, modelId: r.modelId, name: model.name, free: false };
        return null;
      })
      .filter(Boolean) as { providerId: string; modelId: string; name: string; free: boolean }[];
  }, [recentModels, configData, catalogProviders]);

  const hasResults = connectedProviders.length > 0 || unconnectedProviders.length > 0;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>{t("model.title")}</span>
          <button className={styles.closeBtn} onClick={onClose} title={t("common.close")}>
            ✕
          </button>
        </div>

        {/* Search bar */}
        <div className={styles.searchBar}>
          <span className={styles.searchIcon}>
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="text"
            placeholder={t("model.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className={styles.searchClear} onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>

        <div className={styles.body}>
          {/* Current selection indicator */}
          {selectedProvider && selectedModel && (
            <div className={styles.currentBadge}>
              <span className={styles.currentLabel}>{t("model.current")}:</span>
              <span className={styles.currentValue}>
                {configData?.freeModels.find((m) => m.providerId === selectedProvider && m.id === selectedModel)?.name ??
                  catalogProviders.find((p) => p.id === selectedProvider)?.models.find((m) => m.id === selectedModel)?.name ??
                  `${selectedProvider}/${selectedModel}`}
              </span>
            </div>
          )}

          {/* Free models section */}
          {!searchQuery && configData && configData.freeModels.length > 0 && (
            <>
              <SectionLabel>{t("model.freeModels")}</SectionLabel>
              {configData.freeModels.map((m) => {
                const isActive = selectedProvider === m.providerId && selectedModel === m.id;
                return (
                  <ModelRow
                    key={`free:${m.providerId}::${m.id}`}
                    name={m.name}
                    isActive={isActive}
                    badge={t("model.free")}
                    badgeStyle="free"
                    onClick={() => handleSelect(m.providerId, m.id)}
                  />
                );
              })}
              <div className={styles.divider} />
            </>
          )}

          {/* Recent models */}
          {!searchQuery && recentModelEntries.length > 0 && (
            <>
              <SectionLabel>{t("model.recent")}</SectionLabel>
              {recentModelEntries.map((r) => {
                const isActive = selectedProvider === r.providerId && selectedModel === r.modelId;
                return (
                  <ModelRow
                    key={`recent:${r.providerId}::${r.modelId}`}
                    name={r.name}
                    isActive={isActive}
                    badge={r.free ? t("model.free") : undefined}
                    badgeStyle="free"
                    providerId={r.providerId}
                    onClick={() => handleSelect(r.providerId, r.modelId)}
                  />
                );
              })}
              <div className={styles.divider} />
            </>
          )}

          {/* Connected providers */}
          {connectedProviders.length > 0 && (
            <>
              <SectionLabel>
                {searchQuery ? t("model.searchResults") : t("model.connectedProviders")}
              </SectionLabel>
              {connectedProviders.map((p) => (
                <ProviderSection
                  key={p.id}
                  provider={p}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  selectedProvider={selectedProvider}
                  selectedModel={selectedModel}
                  onSelect={handleSelect}
                  onConfigure={handleConfigureProvider}
                />
              ))}
            </>
          )}

          {/* Unconnected providers */}
          {unconnectedProviders.length > 0 && (
            <>
              <SectionLabel>
                {searchQuery ? t("model.searchResults") : t("model.addMore")}
              </SectionLabel>
              {unconnectedProviders.map((p) => (
                <ProviderSection
                  key={p.id}
                  provider={p}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  selectedProvider={selectedProvider}
                  selectedModel={selectedModel}
                  onSelect={handleSelect}
                  onConfigure={handleConfigureProvider}
                />
              ))}
            </>
          )}

          {/* No results */}
          {!catalogLoading && searchQuery && !hasResults && (
            <div className={styles.emptyState}>{t("model.noResults")}</div>
          )}

          {/* Loading */}
          {catalogLoading && catalogProviders.length === 0 && (
            <div className={styles.catalogLoading}>{t("model.loadingProviders")}</div>
          )}

          {/* Initial loading */}
          {!configData && catalogProviders.length === 0 && !catalogLoading && (
            <div className={styles.catalogLoading}>{t("common.loading")}</div>
          )}
        </div>
      </div>

      {/* Provider configuration modal */}
      {configProvider && (
        <ProviderConfigModal
          provider={configProvider}
          onClose={() => {
            setConfigProvider(null);
            // Reload catalog to update connection status
            loadCatalog();
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className={styles.sectionLabel}>{children}</div>;
}

function ModelRow({
  name,
  isActive,
  badge,
  badgeStyle = "default",
  capabilities,
  context,
  cost,
  providerId,
  onClick,
}: {
  name: string;
  isActive: boolean;
  badge?: string;
  badgeStyle?: "free" | "default" | "deprecated" | "beta" | "alpha";
  capabilities?: string[];
  context?: string;
  cost?: string;
  providerId?: string;
  onClick: () => void;
}) {
  const meta = providerId ? providerMeta(providerId) : null;

  return (
    <button
      className={`${styles.modelItem} ${isActive ? styles.active : ""}`}
      onClick={onClick}
    >
      {meta && <span className={styles.modelProviderTag} style={meta.color ? { borderColor: meta.color } : undefined}>{meta.abbr}</span>}
      <span className={styles.modelName}>{name}</span>
      <span className={styles.modelMeta}>
        {capabilities?.map((c) => (
          <span key={c} className={styles.capTag}>{c}</span>
        ))}
        {context && <span className={styles.ctxTag}>{context}</span>}
        {cost && <span className={styles.costTag}>{cost}</span>}
      </span>
      {badge && (
        <span className={`${styles.modelBadge} ${styles[`badge${badge.charAt(0).toUpperCase() + badge.slice(1)}`] || styles.badgeDefault}`}>
          {badge}
        </span>
      )}
      {isActive && (
        <span className={styles.checkmark}>
          <CheckIcon />
        </span>
      )}
    </button>
  );
}

function ProviderSection({
  provider,
  expanded,
  setExpanded,
  selectedProvider,
  selectedModel,
  onSelect,
  onConfigure,
}: {
  provider: AgentCatalogProvider;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  selectedProvider: string;
  selectedModel: string;
  onSelect: (providerId: string, modelId: string) => void;
  onConfigure: (provider: AgentCatalogProvider) => void;
}) {
  const tag = providerTagKey(provider.id);
  const meta = providerMeta(provider.id);
  const isExpanded = expanded === provider.id;
  const t = useT();

  return (
    <div className={styles.providerBlock}>
      <button
        className={styles.providerItem}
        onClick={() => onConfigure(provider)}
      >
        <span className={styles.providerIcon} style={meta.color ? { borderColor: meta.color } : undefined}>
          {meta.abbr}
        </span>
        <span className={styles.providerName}>{provider.name}</span>
        <span className={styles.providerInfo}>
          <span className={styles.providerModelCount}>{provider.models.length}</span>
        </span>
        {tag && <span className={styles.providerTag}>{t(tag)}</span>}
        {provider.connected ? (
          <span className={styles.connectedBadge}>{t("model.connected")}</span>
        ) : (
          <span className={styles.providerAddBtn}>+</span>
        )}
      </button>

      {/* Expanded model list */}
      {isExpanded && provider.connected && (
        <div className={styles.modelSubList}>
          {provider.models.length === 0 && (
            <div className={styles.catalogLoading}>{t("model.noModels")}</div>
          )}
          {provider.models.map((m) => {
            const isActive = selectedProvider === provider.id && selectedModel === m.id;
            return (
              <button
                key={m.id}
                className={`${styles.modelItem} ${isActive ? styles.active : ""}`}
                onClick={() => onSelect(provider.id, m.id)}
              >
                <span className={styles.modelName}>{m.name}</span>
                <span className={styles.modelMeta}>
                  {capabilityTags(m.capabilities).map((c) => (
                    <span key={c} className={styles.capTag}>{c}</span>
                  ))}
                  {m.limit?.context && (
                    <span className={styles.ctxTag}>{formatContext(m.limit)}</span>
                  )}
                  {m.cost && (
                    <span className={styles.costTag}>{formatCost(m.cost)}</span>
                  )}
                </span>
                {m.status && m.status !== "active" && (
                  <span
                    className={styles.modelBadge}
                    style={{
                      background: STATUS_COLORS[m.status]?.bg,
                      color: STATUS_COLORS[m.status]?.text,
                    }}
                  >
                    {m.status}
                  </span>
                )}
                {isActive && (
                  <span className={styles.checkmark}>
                    <CheckIcon />
                  </span>
                )}
              </button>
            );
          })}

          {/* Variants display */}
          {provider.models.some((m) => m.variants && m.variants.length > 0) && (
            <div className={styles.variantSection}>
              {provider.models
                .filter((m) => m.variants && m.variants.length > 0)
                .map((m) =>
                  m.variants!.filter((v) => !v.disabled).map((v) => {
                    const isActive = selectedProvider === provider.id && selectedModel === `${m.id}@${v.id}`;
                    return (
                      <button
                        key={`${m.id}@${v.id}`}
                        className={`${styles.variantItem} ${isActive ? styles.active : ""}`}
                        onClick={() => onSelect(provider.id, `${m.id}@${v.id}`)}
                      >
                        <span className={styles.variantDot}>↳</span>
                        <span className={styles.modelName}>{m.name} · {v.name}</span>
                        {isActive && (
                          <span className={styles.checkmark}>
                            <CheckIcon />
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6l3 3 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 9l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
