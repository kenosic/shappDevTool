import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useT } from "../../i18n";
import type { AgentCatalogProvider, AuthMethod, AuthPrompt } from "../../types/ipc";
import styles from "./ProviderConfigModal.module.css";

interface Props {
  provider: AgentCatalogProvider;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

function keyLabel(provider: AgentCatalogProvider): string {
  return provider.env?.[0] || "API Key";
}

function buildDesc(
  provider: AgentCatalogProvider,
  methods: AuthMethod[],
  t: (key: string) => string,
  inForm: boolean,
  isOAuth: boolean,
  activeLabel?: string,
): string {
  if (isOAuth) return t("model.oauthDesc");
  if (methods.length > 1 && !inForm) return t("model.chooseMethod", { provider: provider.name });
  const label = activeLabel || keyLabel(provider);
  return t("model.providerDesc", { provider: provider.name, key: label });
}

// ── Component ────────────────────────────────────────────────────

export default function ProviderConfigModal({ provider, onClose }: Props) {
  const t = useT();
  const setProviderConfig = useAgentStore((s) => s.setProviderConfig);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<"list" | "form">("list");
  const [activeMethod, setActiveMethod] = useState<AuthMethod | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const methods: AuthMethod[] = provider.authMethods || [];
  const hasChoices = methods.length > 1;
  const inForm = step === "form";
  const isOAuth = activeMethod?.type === "oauth";

  // ── Escape ───────────────────────────────────────────────────
  const goBack = useCallback(() => { setStep("list"); setActiveMethod(null); setVals({}); setErr(null); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (inForm) goBack(); else onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, inForm, goBack]);

  // ── Effective method (synthetic fallback when no auth methods) ──
  const effectiveMethod: AuthMethod | null = useMemo(() => {
    if (activeMethod) return activeMethod;
    if (methods.length === 0) return { type: "api", label: keyLabel(provider) };
    if (methods.length === 1) {
      // Single method: auto-select it; OAuth triggers immediately on submit
      if (methods[0].type === "api") return methods[0];
      // Single OAuth: we still return the method for form rendering; submit handles it
      return methods[0];
    }
    return null;
  }, [activeMethod, methods, provider]);

  // ── Fields ───────────────────────────────────────────────────
  const fields = useMemo(() => {
    if (!effectiveMethod || effectiveMethod.type !== "api") return [];
    const prompts: AuthPrompt[] = effectiveMethod.prompts || [];
    if (prompts.length > 0) {
      return prompts.filter((p) => !p.when || vals[p.when.key] === p.when.value).map((p) => ({
        key: p.key, val: vals[p.key] || "", label: p.message, placeholder: p.placeholder, options: p.options,
      }));
    }
    return [{ key: "key", val: vals["key"] || "", label: effectiveMethod.label, placeholder: t("model.apiKeyPlaceholder"), options: undefined as undefined }];
  }, [effectiveMethod, vals, t]);

  // ── Actions ──────────────────────────────────────────────────
  const pickMethod = (m: AuthMethod) => {
    if (m.type === "oauth") { setSaving(true); setErr(null); setProviderConfig(provider.id, { type: "oauth" }).then(onClose).catch((e: any) => { setErr(e?.message || String(e)); setSaving(false); }); return; }
    setActiveMethod(m); setStep("form"); setVals({}); setErr(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErr(null);
    try {
      if (effectiveMethod?.type === "oauth") {
        await setProviderConfig(provider.id, { type: "oauth" });
      } else {
        const key = vals["key"] || "";
        const extra: Record<string, string> = {};
        for (const f of fields) { if (f.key !== "key" && f.val) extra[f.key] = f.val; }
        await setProviderConfig(provider.id, { type: "api", key: key || undefined, options: Object.keys(extra).length > 0 ? extra : undefined });
      }
      onClose();
    } catch (e: any) { setErr(e?.message || String(e)); } finally { setSaving(false); }
  };

  const canSubmit = effectiveMethod?.type === "oauth" || (fields.length > 0 && fields[0].val.trim().length > 0);
  const title = t("model.connectProvider", { name: provider.name });
  const desc = buildDesc(provider, methods, t, inForm, isOAuth, activeMethod?.label);

  // ── Render ───────────────────────────────────────────────────
  const showChoices = hasChoices && !inForm;
  const showForm = !hasChoices || (inForm && !isOAuth);
  const showOAuth = (inForm && isOAuth) || (!hasChoices && effectiveMethod?.type === "oauth");

  return (
    <div className={styles.overlay} ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className={styles.dialog}>
        {/* Header: back + close only */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {inForm && <button className={styles.backBtn} onClick={goBack} aria-label={t("common.back")}><ArrowLeftIcon /></button>}
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t("common.close")}><CloseIcon /></button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Title row */}
          <div className={styles.titleRow}>
            <span className={styles.providerIcon}>{provider.name.charAt(0).toUpperCase()}</span>
            <span className={styles.providerTitle}>{title}</span>
          </div>

          {/* Description */}
          <div className={styles.desc}>{desc}</div>

          {/* Choice list */}
          {showChoices && (
            <div className={styles.list}>
              {methods.map((m, i) => (
                <button key={i} className={styles.listItem} onClick={() => pickMethod(m)}>
                  <span className={styles.listDot} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Form */}
          {showForm && (
            <form className={styles.form} onSubmit={submit}>
              {fields.map((f) => (
                <div key={f.key} className={styles.field}>
                  <label className={styles.fieldLabel}>{f.label}</label>
                  {f.options ? (
                    <select className={styles.fieldInput} value={f.val} onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}>
                      <option value="">{t("model.selectOption")}</option>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input className={styles.fieldInput} type="text" autoFocus value={f.val} onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                  )}
                </div>
              ))}
              {err && <div className={styles.error}>{err}</div>}
              <button type="submit" className={styles.submit} disabled={saving || !canSubmit}>{saving ? "…" : t("model.submit")}</button>
            </form>
          )}

          {/* OAuth */}
          {showOAuth && (
            <div className={styles.oauthBox}>
              <span className={styles.oauthIcon}><LockIcon /></span>
              <span className={styles.oauthText}>{activeMethod?.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ArrowLeftIcon() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function CloseIcon() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}
function LockIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="6.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 6.5V4a3 3 0 016 0v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}
