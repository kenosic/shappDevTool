import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFile, writeFile, access, readdir, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join, extname, dirname, normalize, basename, relative } from "path";
import { zipSync, strToU8, type Zippable } from "fflate";
import { store } from "../main";
import { HotReloader } from "../watcher/hotReload";
import { checkCocosBundle } from "../lib/app-manifest";

const hotReloader = new HotReloader();

export type AppManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  engine?: string;
  entry: { frontend?: string; backend?: string };
  capabilities?: string[];
  permissions?: { scope: string; reason?: string }[];
  webPreview?: string;
};

export type PackageInfo = {
  dir: string;
  frontendDir: string;
  manifest: AppManifest;
  entries: string[];
  /** 结构校验警告（与上传校验保持一致），不阻塞运行但会在预览界面展示 */
  warnings: string[];
};

async function findManifest(dir: string): Promise<{ manifest: AppManifest; resolvedDir: string } | null> {
  const candidates = ["app.manifest.json", "manifest.json"];

  // Try root first
  for (const name of candidates) {
    try {
      const raw = await readFile(join(dir, name), "utf-8");
      try {
        return { manifest: JSON.parse(raw.replace(/^\uFEFF/, "")) as AppManifest, resolvedDir: dir };
      } catch {
        throw new Error(`清单文件 ${name} JSON 格式错误，请检查文件内容`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("JSON 格式错误")) throw e;
      // file not found — continue
    }
  }

  // Try one level deep (handles versioned bundle structure like {uuid}/{version}/)
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const subdirs = entries.filter((e) => e.isDirectory());
    for (const sub of subdirs) {
      const subDir = join(dir, sub.name);
      for (const name of candidates) {
        try {
          const raw = await readFile(join(subDir, name), "utf-8");
          try {
            return { manifest: JSON.parse(raw.replace(/^\uFEFF/, "")) as AppManifest, resolvedDir: subDir };
          } catch {
            throw new Error(`清单文件 ${name} JSON 格式错误，请检查文件内容`);
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes("JSON 格式错误")) throw e;
          // file not found — continue
        }
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("JSON 格式错误")) throw e;
    // ignore readdir errors
  }

  return null;
}

async function resolveEntries(dir: string, manifest: AppManifest): Promise<string[]> {
  const backendEntry = manifest.entry?.backend ?? "backend/main.ts";
  const candidates = [backendEntry];
  const result: string[] = [];
  for (const e of candidates) {
    try {
      await access(join(dir, e));
      result.push(e);
    } catch {
      // skip
    }
  }
  return result.length > 0 ? result : [backendEntry];
}

async function loadFolderInternal(dirPath: string): Promise<PackageInfo> {
  const found = await findManifest(dirPath);
  const resolvedDir = found?.resolvedDir ?? dirPath;
  const manifest: AppManifest = found?.manifest ?? {
    id: "",
    name: basename(dirPath),
    version: "1.0.0",
    entry: {},
  };
  const entries = await resolveEntries(resolvedDir, manifest);

  // Update recent list (store resolvedDir so reload works correctly)
  const recent: string[] = store.get("recentFolders");
  const filtered = recent.filter((r) => r !== resolvedDir);
  store.set("recentFolders", [resolvedDir, ...filtered].slice(0, 10));

  const frontendEntry = manifest.webPreview ?? manifest.entry?.frontend ?? "frontend";
  const resolvedFrontendEntry = join(resolvedDir, frontendEntry);
  // entry.frontend may point to a file (e.g. "frontend/index.html"); extract the directory in that case
  const frontendDir = extname(frontendEntry) ? dirname(resolvedFrontendEntry) : resolvedFrontendEntry;
  const warnings: string[] = [];

  if (!found) {
    warnings.push("未找到清单文件，请在左侧填写应用信息后保存，将自动创建 app.manifest.json");
  }

  // ── 与上传校验保持一致的结构检查 ────────────────────────────────────
  // 1. webPreview / frontend 目录不存在
  if (!existsSync(frontendDir)) {
    warnings.push(`前端目录 "${frontendEntry}" 不存在，上传到平台时将被拒绝`);
  }

  // 2. Cocos 引擎应用缺少内置资源包（与 platform-api 上传校验规则一致）
  if (manifest.engine === "cocos") {
    const msg = checkCocosBundle(frontendDir, existsSync);
    if (msg) warnings.push(msg);
  }

  return { dir: resolvedDir, frontendDir, manifest, entries, warnings };
}

// ── Build/pack helpers ────────────────────────────────────────────

/** Directories and files always excluded from the output zip */
const PACK_EXCLUDE = new Set([
  "node_modules",
  ".git",
  ".github",
  ".claude",
  ".shapp-sdk",
  ".devtool",
  "dist",
  "out",
  ".DS_Store",
  "Thumbs.db",
]);

const PACK_EXCLUDE_EXT = new Set([".log"]);

async function collectFiles(
  baseDir: string,
  currentDir: string,
  result: Zippable
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (PACK_EXCLUDE.has(entry.name)) continue;
    if (PACK_EXCLUDE_EXT.has(extname(entry.name).toLowerCase())) continue;

    const fullPath = join(currentDir, entry.name);
    const relPath = relative(baseDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      await collectFiles(baseDir, fullPath, result);
    } else if (entry.isFile()) {
      const data = await readFile(fullPath);
      result[relPath] = [new Uint8Array(data), { level: 6 }];
    }
  }
}

async function buildZip(appDir: string): Promise<Buffer> {
  const files: Zippable = {};
  await collectFiles(appDir, appDir, files);
  const zipped = zipSync(files);
  return Buffer.from(zipped);
}

export function registerPackageHandlers(win: BrowserWindow): void {
  ipcMain.handle("package:openFolder", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "选择应用文件夹",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const dirPath = result.filePaths[0];
    const pkg = await loadFolderInternal(dirPath);
    startWatcher(pkg.dir, win);
    return pkg;
  });

  ipcMain.handle("package:loadFolder", async (_e, dirPath: string) => {
    const pkg = await loadFolderInternal(dirPath);
    startWatcher(pkg.dir, win);
    return pkg;
  });

  ipcMain.handle("package:getRecent", () => {
    return store.get("recentFolders");
  });

  ipcMain.handle("package:clearRecent", () => {
    store.set("recentFolders", []);
  });

  ipcMain.handle("package:build", async (_e, appDir: string): Promise<{ outputPath: string } | null> => {
    const found = await findManifest(appDir);
    const manifest = found?.manifest;
    const appName = manifest?.name ?? basename(appDir);
    const version = manifest?.version ?? "1.0.0";
    const defaultName = `${appName}-${version}.zip`;

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "保存应用压缩包",
      defaultPath: join(appDir, defaultName),
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });
    if (canceled || !filePath) return null;

    const zipData = await buildZip(appDir);
    await writeFile(filePath, zipData);
    return { outputPath: filePath };
  });

  ipcMain.handle("package:saveManifest", async (_e, dir: string, manifest: AppManifest) => {
    const candidates = ["app.manifest.json", "manifest.json"];
    for (const name of candidates) {
      const filePath = join(dir, name);
      if (existsSync(filePath)) {
        await writeFile(filePath, JSON.stringify(manifest, null, 2), "utf-8");
        return;
      }
    }
    // No manifest file yet (new/empty project) — create app.manifest.json
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "app.manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  });

  const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
  const MIME_MAP: Record<string, string> = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  };

  ipcMain.handle("package:readImage", async (_e, appDir: string, relPath: string): Promise<string | null> => {
    try {
      const filePath = normalize(join(appDir, relPath));
      if (!filePath.startsWith(normalize(appDir))) return null;
      const data = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      const mime = MIME_MAP[ext] ?? "image/png";
      return `data:${mime};base64,${data.toString("base64")}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle("package:saveImageFile", async (_e, appDir: string, relPath: string, dataUrl: string): Promise<void> => {
    const filePath = normalize(join(appDir, relPath));
    if (!filePath.startsWith(normalize(appDir))) throw new Error("Path traversal not allowed");
    await mkdir(dirname(filePath), { recursive: true });
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
    await writeFile(filePath, Buffer.from(base64, "base64"));
  });

  ipcMain.handle("package:listImages", async (_e, appDir: string, subPath: string): Promise<string[]> => {
    try {
      const dirPath = normalize(join(appDir, subPath));
      if (!dirPath.startsWith(normalize(appDir))) return [];
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && IMAGE_EXTS.has(extname(e.name).toLowerCase()))
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  });

  ipcMain.handle("package:deleteImageFile", async (_e, appDir: string, relPath: string): Promise<void> => {
    const filePath = normalize(join(appDir, relPath));
    if (!filePath.startsWith(normalize(appDir))) throw new Error("Path traversal not allowed");
    await unlink(filePath);
  });

  ipcMain.handle(
    "package:pickImageFiles",
    async (_e, appDir: string, multi: boolean): Promise<{ dataUrl: string; filename: string }[]> => {
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        defaultPath: appDir,
        properties: multi ? ["openFile", "multiSelections"] : ["openFile"],
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      if (canceled || filePaths.length === 0) return [];
      return Promise.all(
        filePaths.map(async (fp) => {
          const data = await readFile(fp);
          const ext = extname(fp).toLowerCase();
          const mime = MIME_MAP[ext] ?? "image/png";
          return { dataUrl: `data:${mime};base64,${data.toString("base64")}`, filename: basename(fp) };
        })
      );
    }
  );
}

function startWatcher(appDir: string, win: BrowserWindow): void {
  hotReloader.start(appDir, {
    onFrontendChange: () => {
      win.webContents.send("package:hotReload", { type: "frontend" });
    },
    onBackendChange: () => {
      win.webContents.send("package:hotReload", { type: "backend" });
    },
    onManifestChange: async () => {
      try {
        const pkg = await loadFolderInternal(appDir);
        win.webContents.send("package:manifestReload", pkg.manifest);
      } catch {
        // ignore parse errors during rapid typing
      }
    },
  });
}
