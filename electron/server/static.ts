import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import { createReadStream, existsSync, statSync, readFileSync } from "fs";
import { join, extname, normalize } from "path";
import { getMimeType, shouldSpaFallback, injectBootstrap } from "../lib/app-manifest";

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
      srv.listen(0, "127.0.0.1", () => {
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
        res.writeHead(404);
        res.end("Not found");
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
}
