import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import { createReadStream, existsSync, statSync, readFileSync } from "fs";
import { join, extname, normalize } from "path";
import { networkInterfaces } from "os";
import { getMimeType, shouldSpaFallback, injectBootstrap } from "../lib/app-manifest";

/** Returns the best-guess LAN IPv4 address, or null if none found.
 *
 *  Many machines have multiple non-internal IPv4 adapters (Hyper-V, WSL, Docker,
 *  VPN, VirtualBox …).  We pick the one most likely to be the real LAN / Wi-Fi
 *  interface by scoring against known interface-name patterns and common private-
 *  range prefixes. */
function getLanIp(): string | null {
  const nets = networkInterfaces();
  const candidates: Array<{ address: string; score: number }> = [];

  // ── interface-name heuristics ──────────────────────────────────────
  // Lower score → better
  const scoreName = (name: string): number => {
    const n = name.toLowerCase();
    // Physical LAN / Wi-Fi adapters (ETHT: "以太网", WLAN: "无线", "Wi-Fi")
    if (/ethernet|^eth\d|^en\d|无线|wi-fi|wlan|^wl/i.test(n)) return 0;
    // Generic "本地连接" / "Local Area Connection" etc.
    if (/本地|local area/i.test(n)) return 1;
    // USB-tethered or bridge adapters – may still work for local LAN
    if (/usb|bridge/i.test(n)) return 2;
    // Any other physical-sounding name
    if (/realtek|intel|broadcom|qualcomm|mediatek|marvell/i.test(n)) return 3;
    // Generic adapter name (no clear virtual indicator, but not physical either)
    return 4;
  };

  // ── IP-range heuristics ────────────────────────────────────────────
  const scoreRange = (ip: string): number => {
    // 192.168.x.x – most common home / office LAN
    if (ip.startsWith("192.168.")) return 0;
    // 10.x.x.x – corporate / larger LANs
    if (ip.startsWith("10.")) return 1;
    // 172.16-172.31 – class-B private
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    // Link-local 169.254.x.x – APIPA, rarely useful but still a valid adapter
    if (ip.startsWith("169.254.")) return 5;
    // Everything else (public IPs via direct connection, etc.)
    return 6;
  };

  for (const [ifName, iface] of Object.entries(nets)) {
    if (!iface) continue;
    // Completely discard well-known virtual adapter names
    if (/hyper-v|virtualbox|docker|wsl|loopback|vmware|vpn|tunnel|bluetooth|pseudo|vethernet|vbox|nat/i.test(ifName)) {
      continue;
    }
    for (const net of iface) {
      if (net.family === "IPv4" && !net.internal) {
        const score = scoreName(ifName) + scoreRange(net.address);
        candidates.push({ address: net.address, score });
      }
    }
  }

  // Sort by score ascending, then pick the best
  candidates.sort((a, b) => a.score - b.score);

  if (candidates.length === 0) {
    // Last resort: return any non-internal IPv4 from any interface
    for (const iface of Object.values(nets)) {
      if (!iface) continue;
      for (const net of iface) {
        if (net.family === "IPv4" && !net.internal) return net.address;
      }
    }
    return null;
  }

  return candidates[0].address;
}

export class StaticServer {
  private server: Server | null = null;
  private port = 0;
  private appDir: string | null = null;
  private frontendDir: string | null = null;

  async start(appDir: string, frontendDir?: string): Promise<{ url: string; port: number }> {
    const resolvedFrontendDir = normalize(frontendDir ?? join(appDir, "frontend"));
    if (this.server && this.appDir === appDir && this.frontendDir === resolvedFrontendDir) {
      // Already serving same dir
      return { url: this.getUrl()!, port: this.port };
    }
    this.stop();

    this.appDir = appDir;
    this.frontendDir = resolvedFrontendDir;

    return new Promise((resolve, reject) => {
      const srv = createServer((req, res) => this.handleRequest(req, res));
      srv.listen(0, "0.0.0.0", () => {
        const addr = srv.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to bind server"));
          return;
        }
        this.port = addr.port;
        this.server = srv;
        resolve({ url: `http://127.0.0.1:${this.port}`, port: this.port });
      });
      srv.on("error", reject);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = 0;
      this.appDir = null;
      this.frontendDir = null;
    }
  }

  getUrl(): string | null {
    if (!this.server || !this.port) return null;
    return `http://127.0.0.1:${this.port}`;
  }

  getLanUrl(): string | null {
    if (!this.server || !this.port) return null;
    const ip = getLanIp();
    if (!ip) return null;
    return `http://${ip}:${this.port}`;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (!this.appDir) {
      res.writeHead(503);
      res.end("Server not configured");
      return;
    }

    const rawUrl = req.url ?? "/";
    // Strip query string and prevent path traversal
    const urlPath = rawUrl.split("?")[0].replace(/\.{2,}/g, "").replace(/\\/g, "/");

    // Special route: serve files stored by ctx.storage.put() during development
    if (urlPath.startsWith("/.devtool/storage/")) {
      const rawKey = urlPath.slice("/.devtool/storage/".length);
      const safeKey = rawKey
        .split("/")
        .filter((p) => p.length > 0 && p !== "." && p !== "..")
        .join("/");
      if (!safeKey) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const storageBase = join(this.appDir, ".devtool", "storage");
      const storageFilePath = join(storageBase, safeKey);
      if (!storageFilePath.startsWith(storageBase)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (!existsSync(storageFilePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      try {
        const stat = statSync(storageFilePath);
        res.writeHead(200, {
          "Content-Type": getMimeType(storageFilePath),
          "Content-Length": stat.size,
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        });
        createReadStream(storageFilePath).pipe(res);
      } catch {
        res.writeHead(500);
        res.end("Internal server error");
      }
      return;
    }

    const relPath = urlPath === "/" ? "/index.html" : urlPath;
    const servingDir = this.frontendDir ?? join(this.appDir, "frontend");
    const filePath = join(servingDir, relPath);

    if (!filePath.startsWith(servingDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!existsSync(filePath)) {
      // Asset files (JS/CSS/JSON/WASM/images etc.) return 404, same as production.
      // Only HTML and extensionless paths (SPA routes) fall back to index.html.
      if (!shouldSpaFallback(relPath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      // SPA fallback for HTML / extensionless paths
      const indexPath = join(servingDir, "index.html");
      if (existsSync(indexPath)) {
        this.serveFile(indexPath, res);
      } else {
        this.serveEmptyPage(req, res);
      }
      return;
    }

    this.serveFile(filePath, res);
  }

  private serveFile(filePath: string, res: ServerResponse): void {
    try {
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        const indexPath = join(filePath, "index.html");
        if (existsSync(indexPath)) {
          this.serveFile(indexPath, res);
        } else {
          res.writeHead(403);
          res.end("Directory listing not allowed");
        }
        return;
      }

      const ext = extname(filePath).toLowerCase();
      const isHtml = ext === ".html" || ext === ".htm";
      const contentType = getMimeType(filePath);

      if (isHtml) {
        // Inject bootstrap script into HTML responses, same as hosting-api,
        // so the app runtime environment is identical in devTool and production.
        const raw = readFileSync(filePath, "utf-8");
        const bootstrapped = injectBootstrap(raw);
        // Inject scrollbar-hiding CSS so the simulator never shows scrollbars,
        // including during screenshots and screen recordings.
        const HIDE_SCROLLBAR =
          `<style>::-webkit-scrollbar{display:none!important}` +
          `*{scrollbar-width:none!important;-ms-overflow-style:none!important}</style>`;
        const html = bootstrapped.includes("</head>")
          ? bootstrapped.replace("</head>", HIDE_SCROLLBAR + "</head>")
          : bootstrapped.includes("<body")
            ? bootstrapped.replace("<body", HIDE_SCROLLBAR + "<body")
            : HIDE_SCROLLBAR + bootstrapped;
        const buf = Buffer.from(html, "utf-8");
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": buf.length,
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(buf);
        return;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });

      const stream = createReadStream(filePath);
      stream.pipe(res);
      stream.on("error", () => {
        res.end();
      });
    } catch {
      res.writeHead(500);
      res.end("Internal server error");
    }
  }

  /** 前端目录尚无内容时，返回友好提示页面而非 404，根据 Accept-Language 切换语言 */
  private serveEmptyPage(req: IncomingMessage, res: ServerResponse): void {
    const lang = (req.headers["accept-language"] ?? "").toLowerCase();
    const isZh = lang.includes("zh");
    const title = isZh ? "预览" : "Preview";
    const heading = isZh ? "暂无前端资源" : "No Frontend Resources";
    const desc = isZh
      ? "通过 OpenCode 向 AI 描述你的需求，即可自动生成应用"
      : "Describe your requirements to the AI via OpenCode to auto-generate your app";
    const html = `<!DOCTYPE html>
<html lang="${isZh ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  background:#f8f9fa;color:#6b7280}
.box{text-align:center;padding:40px}
.icon{font-size:48px;margin-bottom:16px;opacity:.5}
h2{font-size:16px;font-weight:500;margin-bottom:8px}
p{font-size:13px;line-height:1.6}
</style>
</head>
<body>
<div class="box">
<div class="icon">📂</div>
<h2>${heading}</h2>
<p>${desc}</p>
</div>
</body>
</html>`;
    const buf = Buffer.from(html, "utf-8");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": buf.length,
      "Cache-Control": "no-cache",
    });
    res.end(buf);
  }
}
