import React, { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";

import { usePackageStore } from "../../stores/packageStore";
import { useExecutionStore } from "../../stores/executionStore";
import { useLogStore } from "../../stores/logStore";
import CapturePanel from "../modals/CapturePanel";
import { useT } from "../../i18n";
import { localFilenameTimestamp, currentTimeHHMM } from "../../utils/time";
import styles from "./PreviewTab.module.css";

// Device preset with full iOS layout metrics (all in pt / logical pixels)
interface DevicePreset {
  label: string;
  group: "iOS" | "Android" | "Desktop";
  width: number;       // pt
  height: number;      // pt
  statusBarH: number;  // pt – height of the status bar area
  navBarH: number;     // pt – navigation bar height
  safeBottom: number;  // pt – bottom safe area / home indicator
  tabBarH: number;     // pt – standard tab bar height
  hasIsland: boolean;  // Dynamic Island or notch
  isDesktop?: boolean;
}

const DEVICES: DevicePreset[] = [
  // ── iOS ──────────────────────────────────────────────
  // iPhone 17
  { label: "iPhone 17 Pro Max", group: "iOS", width: 440, height: 956, statusBarH: 54, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 17 Pro",     group: "iOS", width: 402, height: 874, statusBarH: 54, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 17 Air",     group: "iOS", width: 420, height: 912, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  { label: "iPhone 17",         group: "iOS", width: 402, height: 874, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  // iPhone 16
  { label: "iPhone 16 Pro Max", group: "iOS", width: 440, height: 956, statusBarH: 54, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 16 Pro",     group: "iOS", width: 402, height: 874, statusBarH: 54, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 16 Plus",    group: "iOS", width: 430, height: 932, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 16",         group: "iOS", width: 393, height: 852, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 16e",        group: "iOS", width: 390, height: 844, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  // iPhone 15
  { label: "iPhone 15 Pro Max", group: "iOS", width: 430, height: 932, statusBarH: 54, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 15 Pro",     group: "iOS", width: 393, height: 852, statusBarH: 54, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 15 Plus",    group: "iOS", width: 430, height: 932, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 15",         group: "iOS", width: 393, height: 852, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  // iPhone 14
  { label: "iPhone 14 Pro Max", group: "iOS", width: 430, height: 932, statusBarH: 54, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 14 Pro",     group: "iOS", width: 393, height: 852, statusBarH: 54, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: true },
  { label: "iPhone 14 Plus",    group: "iOS", width: 428, height: 926, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  { label: "iPhone 14",         group: "iOS", width: 390, height: 844, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  // iPhone 13
  { label: "iPhone 13 Pro Max", group: "iOS", width: 428, height: 926, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  { label: "iPhone 13 Pro",     group: "iOS", width: 390, height: 844, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  { label: "iPhone 13",         group: "iOS", width: 390, height: 844, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  { label: "iPhone 13 mini",    group: "iOS", width: 360, height: 780, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  // iPhone 12
  { label: "iPhone 12 Pro Max", group: "iOS", width: 428, height: 926, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  { label: "iPhone 12 Pro",     group: "iOS", width: 390, height: 844, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  { label: "iPhone 12",         group: "iOS", width: 390, height: 844, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  { label: "iPhone 12 mini",    group: "iOS", width: 360, height: 780, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 49, hasIsland: false },
  // iPhone 11 / X era
  { label: "iPhone 11 Pro Max", group: "iOS", width: 414, height: 896, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 83, hasIsland: false },
  { label: "iPhone 11 Pro",     group: "iOS", width: 375, height: 812, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 83, hasIsland: false },
  { label: "iPhone 11",         group: "iOS", width: 414, height: 896, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 83, hasIsland: false },
  { label: "iPhone XR",         group: "iOS", width: 414, height: 896, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 83, hasIsland: false },
  { label: "iPhone XS Max",     group: "iOS", width: 414, height: 896, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 83, hasIsland: false },
  { label: "iPhone XS",         group: "iOS", width: 375, height: 812, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 83, hasIsland: false },
  { label: "iPhone X",          group: "iOS", width: 375, height: 812, statusBarH: 44, navBarH: 44, safeBottom: 34, tabBarH: 83, hasIsland: false },
  // SE
  { label: "iPhone SE (2020)",  group: "iOS", width: 375, height: 667, statusBarH: 20, navBarH: 44, safeBottom: 0,  tabBarH: 49, hasIsland: false },
  // ── Android ──────────────────────────────────────────
  { label: "Samsung S24 Ultra", group: "Android", width: 412, height: 932, statusBarH: 24, navBarH: 56, safeBottom: 24, tabBarH: 56, hasIsland: false },
  { label: "Samsung S24",       group: "Android", width: 384, height: 832, statusBarH: 24, navBarH: 56, safeBottom: 24, tabBarH: 56, hasIsland: false },
  { label: "Pixel 9 Pro",       group: "Android", width: 412, height: 892, statusBarH: 24, navBarH: 56, safeBottom: 24, tabBarH: 56, hasIsland: false },
  // ── Desktop ──────────────────────────────────────────
  { label: "Desktop 1280",  group: "Desktop", width: 1280, height: 800, statusBarH: 0, navBarH: 0, safeBottom: 0, tabBarH: 0, hasIsland: false, isDesktop: true },
  { label: "Desktop 1440",  group: "Desktop", width: 1440, height: 900, statusBarH: 0, navBarH: 0, safeBottom: 0, tabBarH: 0, hasIsland: false, isDesktop: true },
];

const ZOOM_LEVELS = [0.33, 0.5, 0.67, 0.75, 1.0, 1.25] as const;
type ZoomLevel = (typeof ZOOM_LEVELS)[number];

// Group devices for the selector
const DEVICE_GROUPS: Array<{ group: string; devices: DevicePreset[] }> = [
  { group: "iOS",     devices: DEVICES.filter((d) => d.group === "iOS") },
  { group: "Android", devices: DEVICES.filter((d) => d.group === "Android") },
  { group: "Desktop", devices: DEVICES.filter((d) => d.group === "Desktop") },
];

export default function PreviewTab() {
  const t = useT();
  const pkg = usePackageStore((s) => s.current);
  const mockContext = useExecutionStore((s) => s.mockContext);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [lanUrl, setLanUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"frontend" | "admin">("frontend");
  const [device, setDevice] = useState<DevicePreset>(DEVICES.find(d => d.label === "iPhone 16 Pro") ?? DEVICES[0]);
  const [zoom, setZoom] = useState<ZoomLevel>(0.75);
  const [isRecording, setIsRecording] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureData, setCaptureData] = useState<{
    data: string;
    mimeType: "image/png" | "video/webm";
    filename: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusTime, setStatusTime] = useState(currentTimeHHMM);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Points to the app content area only (excludes status bar + safe bottom)
  const iframeWrapperRef = useRef<HTMLDivElement>(null);
  const appStorageRef = useRef<Record<string, string>>({});
  const pkgRef = useRef(pkg);
  pkgRef.current = pkg;
  const mockContextRef = useRef(mockContext);
  mockContextRef.current = mockContext;
  // Keep a ref to serverUrl so the hot-reload handler never reads a stale value
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;
  // Debounce pending hot-reload to avoid race: src="" snapshot gets used as reload target
  const pendingHotReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    appStorageRef.current = {};
    setPreviewMode("frontend");
  }, [pkg]);

  // Live status bar clock
  useEffect(() => {
    const timer = setInterval(() => setStatusTime(currentTimeHHMM()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      } catch { return; }
      if (!msg || typeof msg.type !== "string") return;
      const iwin = iframeRef.current?.contentWindow;
      switch (msg.type) {
        case "shapp:storage_init_req":
          iwin?.postMessage(JSON.stringify({ type: "shapp:storage_init_data", data: appStorageRef.current }), "*");
          break;
        case "shapp:storage_set":
          appStorageRef.current[String(msg.key ?? "")] = String(msg.value ?? "");
          break;
        case "shapp:storage_remove":
          delete appStorageRef.current[String(msg.key ?? "")];
          break;
        case "shapp:storage_clear":
          appStorageRef.current = {};
          break;
        case "shapp:context_init_req": {
          const ctx = mockContextRef.current;
          const user = ctx.userId ? { id: ctx.userId, nickname: ctx.nickname ?? "DevUser", roles: ctx.roles ?? [] } : null;
          iwin?.postMessage(JSON.stringify({ type: "shapp:context_init_data", user, locale: ctx.locale ?? "zh-CN", geo: ctx.geo ?? null }), "*");
          break;
        }
        case "shapp:request_user_profile": {
          const ctx = mockContextRef.current;
          const profile = ctx.userId ? { id: ctx.userId, nickname: ctx.nickname ?? "DevUser", roles: ctx.roles ?? [], avatar: null } : null;
          iwin?.postMessage(JSON.stringify({ type: "shapp:user_profile_result", requestId: msg.requestId ?? "", profile }), "*");
          break;
        }
        case "shapp:request_permissions": {
          const requestedScopes = (msg.scopes as string[] | undefined) ?? [];
          iwin?.postMessage(JSON.stringify({ type: "shapp:permissions_result", requestId: msg.requestId ?? "", granted: requestedScopes, denied: [] }), "*");
          break;
        }
        case "shapp:check_permissions": {
          const grantedSet = new Set(mockContextRef.current.scopes ?? ["db.*"]);
          const requestedScopes = (msg.scopes as string[] | undefined) ?? [];
          const isGranted = (s: string) => grantedSet.has(s) || grantedSet.has(`${s.split(".")[0]}.*`) || grantedSet.has("*");
          iwin?.postMessage(JSON.stringify({ type: "shapp:permissions_result", requestId: msg.requestId ?? "", granted: requestedScopes.filter(isGranted), denied: requestedScopes.filter((s) => !isGranted(s)) }), "*");
          break;
        }
        case "shapp:rpc": {
          const requestId = String(msg.requestId ?? "");
          const method = String(msg.method ?? "");
          const params = msg.params ?? {};
          const currentPkg = pkgRef.current;
          const entryFile = currentPkg?.entries[0];
          if (!requestId) break;
          if (!currentPkg || !entryFile) {
            iwin?.postMessage(JSON.stringify({ type: "shapp:rpc_result", requestId, data: null, error: { code: "NO_BACKEND", message: "No backend entry found" } }), "*");
            break;
          }
          window.devtool.execution
            .run({ appDir: currentPkg.dir, entryFile, method, params, mockContext: { ...mockContextRef.current, isAdmin: previewMode === "admin" } })
            .then((result) => {
              const target = iframeRef.current?.contentWindow;
              if (result.ok) {
                target?.postMessage(JSON.stringify({ type: "shapp:rpc_result", requestId, data: result.data, error: null }), "*");
              } else {
                target?.postMessage(JSON.stringify({ type: "shapp:rpc_result", requestId, data: null, error: result.error }), "*");
                // Log backend errors to the Log tab for debugging
                useLogStore.getState().append({
                  level: "error",
                  ts: Date.now(),
                  message: `[RPC] ${method} → [${result.error?.code ?? "UNKNOWN"}] ${result.error?.message ?? "Unknown error"}`,
                });
              }
            })
            .catch((err: Error) => {
              const target = iframeRef.current?.contentWindow;
              target?.postMessage(JSON.stringify({ type: "shapp:rpc_result", requestId, data: null, error: { code: "EXECUTION_ERROR", message: err.message } }), "*");
              useLogStore.getState().append({
                level: "error",
                ts: Date.now(),
                message: `[RPC] ${method} → [EXECUTION_ERROR] ${err.message}`,
              });
            });
          break;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [previewMode]);

  useEffect(() => {
    const iwin = iframeRef.current?.contentWindow;
    if (!iwin) return;
    const user = mockContext.userId ? { id: mockContext.userId, nickname: mockContext.nickname ?? "DevUser", roles: mockContext.roles ?? [] } : null;
    iwin.postMessage(JSON.stringify({ type: "shapp:context_init_data", user, locale: mockContext.locale ?? "zh-CN", geo: mockContext.geo ?? null }), "*");
  }, [mockContext]);

  useEffect(() => {
    if (!pkg) return;
    let servingDir: string | undefined;
    if (previewMode === "admin") {
      const adminEntry = pkg.manifest?.entry?.admin as string | undefined;
      if (adminEntry) {
        const slash = adminEntry.lastIndexOf("/");
        const relAdminDir = slash === -1 ? "admin" : adminEntry.slice(0, slash);
        servingDir = `${pkg.dir}/${relAdminDir}`;
      }
    } else {
      servingDir = pkg.frontendDir;
    }
    window.devtool.server.start(pkg.dir, servingDir).then(({ url }) => {
      setServerUrl(url);
      // Fetch LAN URL after server has started
      window.devtool.server.getLanUrl().then((lan) => setLanUrl(lan));
    });
    return () => {
      window.devtool.server.stop();
      setServerUrl(null);
      setLanUrl(null);
      setShowQr(false);
    };
  }, [pkg, previewMode]);

  useEffect(() => {
    if (!pkg) return;
    const unsubscribe = window.devtool.package.onHotReload((event) => {
      if (event.type === "frontend") {
        // Cancel any pending reload; always restore from the latest serverUrl ref
        if (pendingHotReloadRef.current) clearTimeout(pendingHotReloadRef.current);
        if (iframeRef.current) iframeRef.current.src = "";
        pendingHotReloadRef.current = setTimeout(() => {
          pendingHotReloadRef.current = null;
          if (iframeRef.current && serverUrlRef.current) {
            iframeRef.current.src = serverUrlRef.current;
          }
        }, 100);
      }
    });
    return () => {
      if (pendingHotReloadRef.current) {
        clearTimeout(pendingHotReloadRef.current);
        pendingHotReloadRef.current = null;
      }
      unsubscribe();
    };
  }, [pkg]);

  const handleReload = useCallback(() => {
    if (iframeRef.current) iframeRef.current.src = iframeRef.current.src;
  }, []);

  const handleCopyUrl = useCallback(async () => {
    if (!serverUrl) return;
    await navigator.clipboard.writeText(serverUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [serverUrl]);

  const handleOpenExternal = useCallback(() => {
    if (serverUrl) window.devtool.shell.openExternal(serverUrl);
  }, [serverUrl]);

  const handleShowQr = useCallback(async () => {
    // Always re-fetch the LAN URL fresh from the main process — network
    // interfaces may have changed since server start, or the initial
    // detection may have returned the wrong adapter.
    const url = await window.devtool.server.getLanUrl();
    if (!url) {
      setQrDataUrl(null);
      setShowQr(true);
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
      setQrDataUrl(dataUrl);
      setLanUrl(url);
    } catch {
      setQrDataUrl(null);
    }
    setShowQr(true);
  }, []);

  const handleOpenDevTools = useCallback(() => {
    window.devtool.window.openDevTools();
  }, []);

  const handleScreenshot = useCallback(async () => {
    // Hide the platform capsule overlay before capturing
    setIsCapturing(true);
    // Wait two animation frames so React re-renders and the browser paints
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      // Use iframeWrapper rect (app content only) for phone; fall back to full frame for desktop
      const el = iframeWrapperRef.current ?? frameRef.current;
      const rect = el?.getBoundingClientRect();
      const data = await window.devtool.capture.screenshot(
        rect ? { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : undefined
      );
      const ts = localFilenameTimestamp();
      setCaptureData({ data, mimeType: "image/png", filename: `screenshot-${ts}.png` });
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const handleStartRecording = useCallback(async () => {
    chunksRef.current = [];
    try {
      const sourceId = await window.devtool.capture.getWindowSourceId();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-expect-error Electron-specific constraint
          mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId, maxFrameRate: 30 },
        },
      });
      // Use iframeWrapper (app content area) to exclude status bar and safe bottom
      const frameEl = iframeWrapperRef.current ?? frameRef.current;
      const frameRect = frameEl?.getBoundingClientRect();
      let recordStream: MediaStream;
      let cleanupCanvas: (() => void) | null = null;
      if (frameRect && frameRect.width > 0 && frameRect.height > 0) {
        const dpr = window.devicePixelRatio || 1;
        const cropX = Math.round(frameRect.left * dpr), cropY = Math.round(frameRect.top * dpr);
        const cropW = Math.round(frameRect.width * dpr), cropH = Math.round(frameRect.height * dpr);
        const canvas = document.createElement("canvas");
        canvas.width = cropW; canvas.height = cropH;
        const ctx = canvas.getContext("2d")!;
        const srcVideo = document.createElement("video");
        srcVideo.srcObject = stream; srcVideo.muted = true;
        await srcVideo.play();
        let animId = 0;
        const draw = () => { ctx.drawImage(srcVideo, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH); animId = requestAnimationFrame(draw); };
        draw();
        recordStream = canvas.captureStream(30);
        cleanupCanvas = () => { cancelAnimationFrame(animId); stream.getTracks().forEach((t) => t.stop()); srcVideo.pause(); srcVideo.srcObject = null; };
      } else { recordStream = stream; }
      const mr = new MediaRecorder(recordStream, { mimeType: "video/webm;codecs=vp9" });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        cleanupCanvas?.();
        recordStream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const ts = localFilenameTimestamp();
        const reader = new FileReader();
        reader.onloadend = () => { const base64 = reader.result as string; setCaptureData({ data: base64, mimeType: "video/webm", filename: `recording-${ts}.webm` }); };
        reader.readAsDataURL(blob);
        setIsRecording(false);
      };
      mr.start(500);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      recordingTimerRef.current = window.setTimeout(() => handleStopRecording(), 60_000);
    } catch { setIsRecording(false); }
  }, []);

  const handleStopRecording = useCallback(() => {
    if (recordingTimerRef.current) { clearTimeout(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
  }, []);

  const deviceRef = useRef(device);
  deviceRef.current = device;

  // Inject safe-area CSS vars into the iframe when it loads
  const handleIframeLoad = useCallback(() => {
    const iwin = iframeRef.current?.contentWindow;
    if (!iwin) return;
    const d = deviceRef.current;
    // statusBarH is pre-cropped by the simulator frame, so app sees 0 for top safe area.
    // safeBottom is also pre-cropped — app content area is already inside the safe zone.
    iwin.postMessage(JSON.stringify({
      type: "shapp:device_metrics",
      statusBarH: 0,
      navBarH: d.navBarH,
      safeBottom: 0,
      tabBarH: d.tabBarH,
    }), "*");
  }, []);

  const isDesktop = !!device.isDesktop;
  const adminEntry = pkg?.manifest?.entry?.admin as string | undefined;

  // Scale factor: scale phone content to fit available space at selected zoom
  const frameStyle: React.CSSProperties = isDesktop
    ? { width: "100%", height: "100%" }
    : {
        width: device.width * zoom,
        height: device.height * zoom,
        flexShrink: 0,
      };

  return (
    <div className={styles.root}>
      {/* 鈹€鈹€ Toolbar 鈹€鈹€ */}
      <div className={styles.toolbar}>
        {/* Device selector */}
        <div className={styles.toolGroup}>
          <select
            id="deviceSelect"
            className={styles.select}
            value={device.label}
            onChange={(e) => {
              const found = DEVICES.find((d) => d.label === e.target.value);
              if (found) setDevice(found);
            }}
          >
            {DEVICE_GROUPS.map(({ group, devices }) => (
              <optgroup key={group} label={group}>
                {devices.map((d) => (
                  <option key={d.label} value={d.label}>{d.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {!isDesktop && (
            <span className={styles.dimensionLabel}>{device.width} × {device.height}</span>
          )}
          <select
            className={styles.select}
            value={String(zoom)}
            onChange={(e) => setZoom(Number(e.target.value) as ZoomLevel)}
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>
            ))}
          </select>
        </div>

        <div className={styles.toolDivider} />

        {/* Frontend / Admin toggle */}
        <div className={styles.segmented}>
          <button
            className={`${styles.segBtn} ${previewMode === "frontend" ? styles.segBtnActive : ""}`}
            onClick={() => setPreviewMode("frontend")}
            title={t("preview.frontendTitle")}
          >
            <FrontendIcon /> {t("preview.frontend")}
          </button>
          {adminEntry && (
            <button
              className={`${styles.segBtn} ${previewMode === "admin" ? styles.segBtnAdminActive : ""}`}
              onClick={() => setPreviewMode("admin")}
              title={t("preview.adminTitle")}
            >
              <AdminIcon /> {t("preview.admin")}
            </button>
          )}
        </div>

        <div className={styles.toolDivider} />

        {/* URL bar */}
        <button className={styles.toolBtn} onClick={handleCopyUrl}
          title={copied ? t("preview.copied") + "!" : t("preview.copyUrl")}
        >
          <LinkIcon />
          <span className={styles.urlText}>
            {serverUrl ?? t("preview.waitingServer")}
          </span>
          {copied && <span className={styles.copiedBadge}>{t("preview.copied")}</span>}
        </button>

        {/* Action buttons */}
        <button className={styles.toolBtn} onClick={handleOpenExternal} disabled={!serverUrl} title={t("preview.openExternal")}>
          <OpenExternalIcon />
          <span className={styles.toolBtnLabel}>{t("preview.openExternal")}</span>
        </button>
        <button className={styles.toolBtn} onClick={handleShowQr} disabled={!serverUrl} title={t("preview.lanQr")}>
          <QrIcon />
          <span className={styles.toolBtnLabel}>{t("preview.lanQr")}</span>
        </button>
        <button className={styles.toolBtn} onClick={handleScreenshot} title={t("preview.screenshot")}>
          <ScreenshotIcon />
          <span className={styles.toolBtnLabel}>{t("preview.screenshot")}</span>
        </button>
        {!isRecording ? (
          <button className={styles.toolBtn} onClick={handleStartRecording} title={t("preview.record")}>
            <RecordIcon />
            <span className={styles.toolBtnLabel}>{t("preview.record")}</span>
          </button>
        ) : (
          <button className={`${styles.toolBtn} ${styles.toolBtnRecording}`} onClick={handleStopRecording} title={t("preview.stopRecord")}>
            <StopRecordIcon />
            <span className={styles.toolBtnLabel}>{t("common.stop")}</span>
          </button>
        )}
      </div>

      {/* ── Preview area with left strip ── */}
      <div className={styles.previewOuter}>
        {/* Left vertical icon strip */}
        <div className={styles.leftStrip}>
          <button className={styles.leftStripBtn} title={t("preview.switchDevice")} onClick={() => document.getElementById('deviceSelect')?.focus()}>
            <DeviceSmIcon />
          </button>
          <div className={styles.leftStripSep} />
          <button className={styles.leftStripBtn} title={t("preview.zoomIn")} onClick={() => {
            const idx = ZOOM_LEVELS.indexOf(zoom);
            if (idx < ZOOM_LEVELS.length - 1) setZoom(ZOOM_LEVELS[idx + 1]);
          }}>
            <PlusIcon />
          </button>
          <button className={styles.leftStripBtn} title={t("preview.zoomOut")} onClick={() => {
            const idx = ZOOM_LEVELS.indexOf(zoom);
            if (idx > 0) setZoom(ZOOM_LEVELS[idx - 1]);
          }}>
            <MinusIcon />
          </button>
          <div className={styles.leftStripSep} />
          <button className={styles.leftStripBtn} title={t("preview.fitWindow")} onClick={() => setZoom(0.75)}>
            <FitIcon />
          </button>
        </div>
        <div className={`${styles.previewArea} ${isDesktop ? styles.previewAreaDesktop : ""}`}>
          {serverUrl ? (
          <div
            ref={frameRef}
            className={isDesktop ? styles.desktopFrame : styles.phoneFrameWrapper}
            style={isDesktop ? undefined : frameStyle}
          >
            {/* iPhone bezel frame */}
            {!isDesktop && (
              <div className={styles.phoneBezel} style={{ width: device.width * zoom, height: device.height * zoom }}>
                {/* Dynamic Island — scaled position & size */}
                {device.hasIsland && (
                  <div
                    className={styles.dynamicIsland}
                    style={{
                      top: 12 * zoom,
                      width: 126 * zoom,
                      height: 37 * zoom,
                      borderRadius: 20 * zoom,
                    }}
                  />
                )}
                {/* Status bar — height = statusBarH * zoom */}
                <div
                  className={styles.phoneStatus}
                  style={{
                    height: device.statusBarH * zoom,
                    opacity: zoom < 0.45 ? 0 : 1,
                  }}
                >
                  <span className={styles.statusTime}>{statusTime}</span>
                  <div className={styles.statusIcons}>
                    <SignalIcon />
                    <WifiIcon />
                    <BatteryIcon />
                  </div>
                </div>
                {/* App content iframe — starts below status bar, ends above home indicator */}
                <div
                  ref={iframeWrapperRef}
                  className={styles.iframeWrapper}
                  style={{
                    top: device.statusBarH * zoom,
                    left: 0,
                    width: device.width * zoom,
                    height: (device.height - device.statusBarH - device.safeBottom) * zoom,
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    src={serverUrl}
                    className={styles.iframe}
                    style={{
                      width: device.width,
                      height: device.height - device.statusBarH - device.safeBottom,
                      transform: `scale(${zoom})`,
                      transformOrigin: "top left",
                    }}
                    title={previewMode === "admin" ? "Admin Preview" : "App Preview"}
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    onLoad={handleIframeLoad}
                  />
                </div>
                {/* Home indicator / bottom safe area */}
                {device.safeBottom > 0 && (
                  <div
                    className={styles.homeIndicator}
                    style={{
                      opacity: zoom < 0.45 ? 0 : 1,
                      height: device.safeBottom * zoom,
                      bottom: 0,
                    }}
                  />
                )}
                {/* Admin badge */}
                {previewMode === "admin" && (
                  <div className={styles.adminBadge}>{t("preview.adminBadge")}</div>
                )}
                {/* Platform capsule overlay — mirrors the host app's "more / close" buttons
                    so app developers know to keep the top-right corner clear.
                    Hidden during screenshot / recording so it doesn't appear in captured media. */}
                <div
                  style={{
                    position: 'absolute',
                    top: (device.statusBarH + 8) * zoom,
                    right: 8 * zoom,
                    zIndex: 24,
                    opacity: zoom < 0.45 || isCapturing || isRecording ? 0 : 1,
                    visibility: isCapturing || isRecording ? 'hidden' : 'visible',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(0,0,0,0.22)',
                    borderRadius: 20 * zoom,
                    padding: `${3 * zoom}px ${4 * zoom}px`,
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                  } as React.CSSProperties}
                >
                  <span style={{
                    width: 32 * zoom,
                    height: 32 * zoom,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: 14 * zoom,
                    fontWeight: 600,
                    letterSpacing: 1,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}>···</span>
                  <span style={{
                    display: 'block',
                    width: 1 * zoom,
                    height: 14 * zoom,
                    background: 'rgba(255,255,255,0.3)',
                    margin: `0 ${5 * zoom}px`,
                    flexShrink: 0,
                  }} />
                  <span style={{
                    width: 32 * zoom,
                    height: 32 * zoom,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: 13 * zoom,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}>✕</span>
                </div>
                {/* Safe-area overlay — faint tinted bands (toggle-able in future) */}
              </div>
            )}
            {isDesktop && (
              <iframe
                ref={iframeRef}
                src={serverUrl}
                className={styles.iframe}
                title={previewMode === "admin" ? "Admin Preview" : "App Preview"}
                sandbox="allow-scripts allow-same-origin allow-forms"
                onLoad={handleIframeLoad}
              />
            )}
          </div>
        ) : (
          <div className={styles.empty}>
            {previewMode === "admin"
              ? (adminEntry ? t("preview.startingAdmin") : t("preview.noAdminEntry"))
              : (pkg?.manifest?.entry?.frontend ? t("preview.startingStatic") : t("preview.noFrontendEntry"))}
          </div>
        )}
        </div>
      </div>
      {captureData && pkg && (
        <CapturePanel
          data={captureData.data}
          mimeType={captureData.mimeType}
          filename={captureData.filename}
          appDir={pkg.dir}
          onClose={() => setCaptureData(null)}
        />
      )}
      {showQr && (
        <div className={styles.qrOverlay} onClick={() => setShowQr(false)}>
          <div className={styles.qrModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.qrModalHeader}>
              <span className={styles.qrModalTitle}>{t("preview.lanQrTitle")}</span>
              <button className={styles.qrCloseBtn} onClick={() => setShowQr(false)}>✕</button>
            </div>
            {lanUrl && qrDataUrl ? (
              <>
                <img src={qrDataUrl} alt="QR Code" className={styles.qrImage} />
                <div className={styles.qrUrl}>{lanUrl}</div>
                <div className={styles.qrTip}>{t("preview.lanQrScanTip")}</div>
              </>
            ) : (
              <div className={styles.qrNoIp}>{t("preview.lanQrNoIp")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* 鈹€鈹€ inline icons 鈹€鈹€ */
function FrontendIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M4 5.5L5.5 7L8 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function AdminIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2" /><path d="M2 10.5c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
}
function LinkIcon() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M4.5 2.5H3a1 1 0 00-1 1v4.5a1 1 0 001 1h4.5a1 1 0 001-1V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><path d="M6 1h4v4M10 1L5.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function OpenExternalIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M5 2H2.5C1.67 2 1 2.67 1 3.5v6C1 10.33 1.67 11 2.5 11h6c.83 0 1.5-.67 1.5-1.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><path d="M7 1h4v4M11 1L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ScreenshotIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="3" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><circle cx="6" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M4 3l.5-1.5h3L8 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function RecordIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2" /><circle cx="6" cy="6" r="2" fill="var(--color-danger)" /></svg>;
}
function StopRecordIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3" y="3" width="6" height="6" rx="1" fill="var(--color-danger)" /></svg>;
}
function SignalIcon() {
  return <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor"><rect x="0" y="7" width="2.5" height="3" rx="0.5" /><rect x="3.5" y="5" width="2.5" height="5" rx="0.5" /><rect x="7" y="3" width="2.5" height="7" rx="0.5" /><rect x="10.5" y="0" width="2.5" height="10" rx="0.5" /></svg>;
}
function WifiIcon() {
  return <svg width="14" height="11" viewBox="0 0 14 11" fill="none"><path d="M1 4C3.4 1.5 10.6 1.5 13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M3 6.5C4.6 5 9.4 5 11 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M5 9c.8-.8 4-.8 4.8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="7" cy="11" r="0.8" fill="currentColor" /></svg>;
}
function BatteryIcon() {
  return <svg width="18" height="10" viewBox="0 0 18 10" fill="none"><rect x="0.5" y="1" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.2" /><rect x="2" y="2.5" width="10" height="5" rx="1" fill="currentColor" /><path d="M15.5 3.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}
function DeviceSmIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" /><circle cx="7" cy="11" r="0.8" fill="currentColor" /><line x1="5" y1="2.5" x2="9" y2="2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
}
function FitIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 4V2a1 1 0 011-1h2M10 1h2a1 1 0 011 1v2M13 10v2a1 1 0 01-1 1h-2M4 13H2a1 1 0 01-1-1v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
}
function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}
function MinusIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}
function QrIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="2.5" width="1" height="1" fill="currentColor" />
      <rect x="7" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8.5" y="2.5" width="1" height="1" fill="currentColor" />
      <rect x="1" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="8.5" width="1" height="1" fill="currentColor" />
      <rect x="7" y="7" width="1.5" height="1.5" fill="currentColor" />
      <rect x="9.5" y="7" width="1.5" height="1.5" fill="currentColor" />
      <rect x="7" y="9.5" width="1.5" height="1.5" fill="currentColor" />
      <rect x="9.5" y="9.5" width="1.5" height="1.5" fill="currentColor" />
    </svg>
  );
}
