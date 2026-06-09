import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePackageStore } from "../../stores/packageStore";
import { useT } from "../../i18n";
import type { AppManifest } from "../../types/ipc";
import styles from "./Sidebar.module.css";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Sidebar() {
  const t = useT();
  const pkg = usePackageStore((s) => s.current);
  const setManifest = usePackageStore((s) => s.setManifest);
  const [draft, setDraft] = useState<AppManifest | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipReloadRef = useRef(false);

  useEffect(() => {
    if (pkg?.manifest) setDraft(pkg.manifest);
  }, [pkg?.manifest]);

  useEffect(() => {
    if (!window.devtool.package.onManifestReload) return;
    return window.devtool.package.onManifestReload((m: AppManifest) => {
      if (skipReloadRef.current) return;
      setDraft(m);
      setManifest(m);
    });
  }, [setManifest]);

  const scheduleSave = useCallback(
    (updated: AppManifest) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(async () => {
        if (!pkg) return;
        skipReloadRef.current = true;
        try {
          await window.devtool.package.saveManifest(pkg.dir, updated);
          setManifest(updated);
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 1500);
        } catch {
          setSaveStatus("error");
        } finally {
          setTimeout(() => { skipReloadRef.current = false; }, 1200);
        }
      }, 600);
    },
    [pkg, setManifest]
  );

  const update = useCallback(
    (patch: Partial<AppManifest>) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  if (!pkg || !draft) return null;

  return (
    <aside className={styles.sidebar}>
      {/* Header: logo + title + save status */}
      <div className={styles.manifestHeader}>
        <LogoAvatar
          appDir={pkg.dir}
          logo={draft.logo}
          onLogoChange={(relPath) => update({ logo: relPath })}
        />
        <div className={styles.headerRight}>
          <span className={styles.headerTitle}>{draft.title || draft.name || t("sidebar.unnamedApp")}</span>
          <div className={styles.saveIndicator}>
            {saveStatus === "saving" && (
              <span className={`${styles.saveChip} ${styles.saveChipSaving}`}><SpinnerIcon /> {t("sidebar.saving")}</span>
            )}
            {saveStatus === "saved" && (
              <span className={`${styles.saveChip} ${styles.saveChipSaved}`}>✓ {t("sidebar.saved")}</span>
            )}
            {saveStatus === "error" && (
              <span className={`${styles.saveChip} ${styles.saveChipError}`}>! {t("sidebar.saveError")}</span>
            )}
          </div>
        </div>
      </div>

      {/* App info — editable */}
      <SidebarSection title={t("sidebar.appInfo")} defaultOpen>
        <div className={styles.fieldList}>
          <FieldRow label={t("sidebar.title")} value={draft.title ?? ""} onChange={(v) => update({ title: v })} />
          <FieldRow label={t("sidebar.name")} value={draft.name ?? ""} onChange={(v) => update({ name: v })} mono />
          <FieldRow label={t("sidebar.version")} value={draft.version ?? ""} onChange={(v) => update({ version: v })} mono />
          <FieldRow label={t("sidebar.description")} value={draft.description ?? ""} onChange={(v) => update({ description: v })} multiline />
        </div>
      </SidebarSection>

      {/* Media — merged cover + carousel, draggable */}
      <SidebarSection title={t("sidebar.media")} defaultOpen>
        <MediaEditor
          appDir={pkg.dir}
          manifestImages={draft.images}
          onImagesChange={(imgs) => update({ images: imgs })}
          t={t}
        />
      </SidebarSection>

      {/* More info — collapsed by default */}
      <SidebarSection title={t("sidebar.moreInfo")} defaultOpen={false}>
        <div className={styles.readonlyList}>
          {draft.id && (
            <div className={styles.readonlyItem}>
              <span className={styles.readonlyItemLabel}>{t("sidebar.id")}</span>
              <span className={`${styles.readonlyVal} ${styles.mono}`}>{draft.id}</span>
            </div>
          )}
          {draft.runtime && (
            <div className={styles.readonlyItem}>
              <span className={styles.readonlyItemLabel}>{t("sidebar.runtime")}</span>
              <span className={`${styles.readonlyVal} ${styles.mono}`}>{draft.runtime}</span>
            </div>
          )}
          {(draft.entry?.frontend || draft.entry?.backend || (draft.entry as any)?.admin) && (
            <div className={styles.readonlyItem}>
              <span className={styles.readonlyItemLabel}>{t("sidebar.entryPoints")}</span>
              <div className={styles.readonlySubList}>
                {draft.entry?.frontend && (
                  <div className={styles.readonlySubItem}>
                    <span className={styles.readonlyItemLabel}>{t("sidebar.entryFrontend")}</span>
                    <span className={`${styles.readonlyVal} ${styles.mono}`}>{draft.entry.frontend}</span>
                  </div>
                )}
                {draft.entry?.backend && (
                  <div className={styles.readonlySubItem}>
                    <span className={styles.readonlyItemLabel}>{t("sidebar.entryBackend")}</span>
                    <span className={`${styles.readonlyVal} ${styles.mono}`}>{draft.entry.backend}</span>
                  </div>
                )}
                {(draft.entry as any)?.admin && (
                  <div className={styles.readonlySubItem}>
                    <span className={styles.readonlyItemLabel}>{t("sidebar.entryAdmin")}</span>
                    <span className={`${styles.readonlyVal} ${styles.mono}`}>{(draft.entry as any).admin}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {(draft.capabilities ?? []).length > 0 && (
            <div className={styles.readonlyItem}>
              <span className={styles.readonlyItemLabel}>{t("sidebar.capabilities")}</span>
              <div className={styles.tagRow}>
                {draft.capabilities!.map((cap) => (
                  <span key={cap} className={styles.tag}>{cap}</span>
                ))}
              </div>
            </div>
          )}
          {(draft.permissions ?? []).length > 0 && (
            <div className={styles.readonlyItem}>
              <span className={styles.readonlyItemLabel}>{t("sidebar.permissions")}</span>
              <ul className={styles.permReadList}>
                {draft.permissions!.map((p, i) => (
                  <li key={i} className={styles.permReadItem}>
                    <span className={`${styles.permReadScope} ${styles.mono}`}>{p.scope}</span>
                    {p.reason && <span className={styles.permReadReason}>{p.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SidebarSection>

      {/* Warnings */}
      {pkg.warnings && pkg.warnings.length > 0 && (
        <SidebarSection title={t("sidebar.warnings")} badge={String(pkg.warnings.length)} badgeVariant="warn" defaultOpen>
          <ul className={styles.warnList}>
            {pkg.warnings.map((w, i) => (
              <li key={i} className={styles.warnItem}>{w}</li>
            ))}
          </ul>
        </SidebarSection>
      )}

      <div className={styles.spacer} />
      <div className={styles.footer}>
        <button className={styles.footerBtn} onClick={() => window.devtool.shell.showItemInFolder(pkg.dir)}>
          <FolderIcon />
          {t("sidebar.showInFolder")}
        </button>
      </div>
    </aside>
  );
}

// ── Logo avatar (header, clickable) ─────────────────────────────────────────

function LogoAvatar({ appDir, logo, onLogoChange }: {
  appDir: string; logo: string | undefined; onLogoChange: (relPath: string) => void;
}) {
  const t = useT();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!logo) { setDataUrl(null); return; }
    window.devtool.package.readImage(appDir, logo).then(setDataUrl).catch(() => setDataUrl(null));
  }, [appDir, logo]);

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const relPath = `assets/logo.${ext}`;
    const url = await fileToDataUrl(file);
    await window.devtool.package.saveImageFile(appDir, relPath, url);
    setDataUrl(url);
    onLogoChange(relPath);
    e.target.value = "";
  };

  return (
    <div className={styles.logoAvatar} onClick={() => fileInputRef.current?.click()} title={t("sidebar.clickToChange")}>
      {dataUrl ? (
        <img src={dataUrl} alt="logo" className={styles.logoImg} />
      ) : (
        <AppIconSvg />
      )}
      <div className={styles.logoOverlay}><CameraIcon /></div>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePick} />
    </div>
  );
}

// ── Merged media editor (cover + carousel, draggable) ─────────────────────────

function MediaEditor({
  appDir, manifestImages, onImagesChange, t,
}: {
  appDir: string;
  manifestImages?: string[];
  onImagesChange: (images: string[]) => void;
  t: (k: string) => string;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const filesRef = useRef<string[]>([]);
  filesRef.current = files;
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const dragIndexRef = useRef<number>(-1);
  const [dragOverIndex, setDragOverIndex] = useState<number>(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Discover ordered file list from filesystem when manifest has no images
  const discover = useCallback(async (): Promise<string[]> => {
    const result: string[] = [];
    for (const n of ["cover.png", "cover.jpg", "cover.jpeg", "cover.webp"]) {
      const url = await window.devtool.package.readImage(appDir, `assets/${n}`);
      if (url) { result.push(`assets/${n}`); break; }
    }
    if (result.length === 0) {
      const loose = await window.devtool.package.listImages(appDir, "assets");
      if (loose.length > 0) result.push(`assets/${loose[0]}`);
    }
    const carousel = await window.devtool.package.listImages(appDir, "assets/carousel");
    for (const f of carousel) result.push(`assets/carousel/${f}`);
    return result;
  }, [appDir]);

  // Initialize once per appDir
  useEffect(() => {
    let cancelled = false;
    setInitialized(false);
    (async () => {
      const snapshot = manifestImages; // capture at effect time
      const paths = (snapshot && snapshot.length > 0) ? snapshot : await discover();
      const urls: Record<string, string> = {};
      await Promise.all(paths.map(async (p) => {
        const url = await window.devtool.package.readImage(appDir, p);
        if (url) urls[p] = url;
      }));
      if (cancelled) return;
      const valid = paths.filter((p) => urls[p]);
      setFiles(valid);
      setDataUrls(urls);
      setInitialized(true);
    })();
    return () => { cancelled = true; };
  }, [appDir]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to simulator captures
  useEffect(() => {
    return window.devtool.package.onAssetsChanged(async (info) => {
      if (info.appDir !== appDir) return;
      const ext = info.filename.split(".").pop()?.toLowerCase() || "png";
      const newPath = info.role === "cover"
        ? `assets/cover.${ext}`
        : `assets/carousel/${info.filename}`;
      const url = await window.devtool.package.readImage(appDir, newPath);
      if (!url) return;
      // Compute next synchronously using the ref (avoids setState-during-render)
      const prev = filesRef.current;
      let next: string[];
      if (info.role === "cover") {
        // Replace existing cover (any assets/cover.*) or prepend
        const idx = prev.findIndex((p) => p.startsWith("assets/cover."));
        next = idx >= 0 ? prev.map((p, i) => (i === idx ? newPath : p)) : [newPath, ...prev];
      } else {
        next = prev.includes(newPath) ? prev : [...prev, newPath];
      }
      setDataUrls((d) => ({ ...d, [newPath]: url }));
      setFiles(next);
      onImagesChange(next);
    });
  }, [appDir, onImagesChange]);

  // Drag and drop
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-internal", String(index));
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from < 0 || from === dropIndex) { setDragOverIndex(-1); return; }
    const next = [...files];
    const [moved] = next.splice(from, 1);
    next.splice(dropIndex, 0, moved);
    setFiles(next);
    onImagesChange(next);
    dragIndexRef.current = -1;
    setDragOverIndex(-1);
  };
  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    dragIndexRef.current = -1;
    setDragOverIndex(-1);
  };

  const handleAdd = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const nextFiles = [...files];
    const nextUrls = { ...dataUrls };
    for (const file of Array.from(fileList)) {
      const filename = file.name;
      const rel = `assets/carousel/${filename}`;
      const url = await fileToDataUrl(file);
      await window.devtool.package.saveImageFile(appDir, rel, url);
      nextUrls[rel] = url;
      if (!nextFiles.includes(rel)) nextFiles.push(rel);
    }
    setFiles(nextFiles);
    setDataUrls(nextUrls);
    onImagesChange(nextFiles);
    e.target.value = "";
  };

  const handleDelete = async (index: number) => {
    const path = files[index];
    try { await window.devtool.package.deleteImageFile(appDir, path); } catch { /* ignore */ }
    const nextFiles = files.filter((_, i) => i !== index);
    const nextUrls = { ...dataUrls };
    delete nextUrls[path];
    setFiles(nextFiles);
    setDataUrls(nextUrls);
    onImagesChange(nextFiles);
  };

  return (
    <div className={styles.mediaEditor}>
      {initialized && files.length === 0 && (
        <div className={styles.mediaEmpty} onClick={handleAdd}>
          <ImageIcon />
          <span>{t("sidebar.noCover")}</span>
        </div>
      )}
      <div className={styles.mediaGrid}>
        {files.map((f, i) => (
          <div
            key={f}
            className={`${styles.mediaGridItem} ${dragOverIndex === i ? styles.mediaItemOver : ""}`}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragLeave={(e) => { e.stopPropagation(); setDragOverIndex(-1); }}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
          >
            <img src={dataUrls[f]} alt="" className={styles.mediaGridImg} draggable={false} />
            {i === 0 && <span className={styles.coverBadge}>{t("sidebar.coverBadge")}</span>}
            <button className={styles.mediaItemDelete} onClick={() => handleDelete(i)} title="Remove">
              <DeleteIcon />
            </button>
          </div>
        ))}
        <button className={styles.mediaAddGridBtn} onClick={handleAdd}>
          <span className={styles.carouselAddPlus}>+</span>
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />
    </div>
  );
}

// ── Editable field row ────────────────────────────────────────────────────────

function FieldRow({ label, value, onChange, mono = false, multiline = false }: {
  label: string; value: string; onChange: (v: string) => void; mono?: boolean; multiline?: boolean;
}) {
  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldLabel}>{label}</div>
      {multiline ? (
        <textarea
          className={`${styles.fieldInput} ${styles.fieldTextarea} ${mono ? styles.mono : ""}`}
          value={value} onChange={(e) => onChange(e.target.value)} rows={2} spellCheck={false}
        />
      ) : (
        <input
          type="text"
          className={`${styles.fieldInput} ${mono ? styles.mono : ""}`}
          value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false}
        />
      )}
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function SidebarSection({ title, badge, badgeVariant = "default", defaultOpen = true, children }: {
  title: string; badge?: string; badgeVariant?: "success" | "warn" | "default";
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setCollapsed(!collapsed)}>
        <span className={styles.sectionChevron}>{collapsed ? "▸" : "▾"}</span>
        <span className={styles.sectionTitle}>{title}</span>
        {badge && (
          <span className={`${styles.badge} ${badgeVariant === "success" ? styles.badgeSuccess : badgeVariant === "warn" ? styles.badgeWarn : styles.badgeDefault}`}>
            {badge}
          </span>
        )}
      </button>
      {!collapsed && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function AppIconSvg() {
  return (
    <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="26" height="26">
      <path d="M915.084916 719.854978 810.23287 719.854978 810.23287 614.985536c0-23.303752-17.479093-40.782845-40.782845-40.782845s-40.782845 17.479093-40.782845 40.782845l0 110.696148L612.144326 725.681684c-23.303752 0-40.782845 17.479093-40.782845 40.782845s17.479093 40.782845 40.782845 40.782845l110.696148 0 0 110.678752c0 23.303752 17.479093 40.782845 40.782845 40.782845s40.782845-17.479093 40.782845-40.782845L804.406165 807.247374 915.084916 807.247374c23.304775 0 40.782845-17.47807 40.782845-40.782845C961.694467 743.160777 938.390715 719.854978 915.084916 719.854978L915.084916 719.854978 915.084916 719.854978zM506.427586 825.749774 506.427586 825.749774 141.658835 825.749774c-13.524015 0-23.675212-10.151197-23.675212-23.710005L117.983623 139.732461c0-13.533224 10.151197-23.684422 23.675212-23.684422l646.381593 0c13.505595 0 23.657816 10.151197 23.657816 23.684422l0 357.988324 0 0 0 0c0 13.524015 10.169617 23.676236 23.711028 23.676236 13.522991 0 23.675212-10.152221 23.675212-23.676236l0 0 0 0L859.084485 116.049063c0-27.073612-23.675212-50.759057-50.758034-50.759057L117.9826 65.290005c-27.065426 0-50.758034 23.685445-50.758034 50.759057L67.224566 825.749774c0 27.048029 23.692608 50.740638 50.758034 50.740638L506.427586 876.490412l0 0c13.522991 0 23.675212-10.169617 23.675212-23.692608C530.101775 835.883575 519.949554 825.749774 506.427586 825.749774L506.427586 825.749774 506.427586 825.749774zM501.447155 708.202591c17.479093-34.95614 58.261938-58.261938 99.044784-58.261938l46.608527 0 0-52.43421c0-46.609551 29.131481-87.392396 69.913303-104.870466l0 0 0 0-58.260915-174.774559L454.838627 580.028373l-58.261938-93.218078L181.028495 708.202591 501.447155 708.202591 501.447155 708.202591 501.447155 708.202591zM396.577712 335.331301c0-34.94693-29.130458-64.078411-64.086597-64.078411s-64.087621 29.131481-64.087621 64.078411c0 34.957163 29.130458 64.087621 64.087621 64.087621S396.577712 370.288464 396.577712 335.331301L396.577712 335.331301 396.577712 335.331301zM396.577712 335.331301" fill="white" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 2.5C1 2.22 1.22 2 1.5 2H4L5 3H10.5C10.78 3 11 3.22 11 3.5V9.5C11 9.78 10.78 10 10.5 10H1.5C1.22 10 1 9.78 1 9.5V2.5Z"
        stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 4.5C1 3.95 1.45 3.5 2 3.5h1.5l1-1.5h3l1 1.5H12c.55 0 1 .45 1 1v6c0 .55-.45 1-1 1H2c-.55 0-1-.45-1-1v-6z"
        stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 13l4-4 3 3 3-3 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={styles.spinnerSvg}>
      <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 16" />
    </svg>
  );
}
