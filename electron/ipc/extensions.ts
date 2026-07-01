/**
 * Extension management IPC handlers.
 *
 * Scans the extensions/ directory for installed VS Code-compatible extensions,
 * supports installing from .vsix files, and enable/disable toggling.
 */

import { ipcMain, dialog, BrowserWindow } from "electron";
import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  rm,
} from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { app } from "electron";
import { unzipSync } from "fflate";

// ── Types ──────────────────────────────────────────────────────────

export type VSCodeExtension = {
  id: string; // "<publisher>.<name>"
  name: string;
  displayName: string;
  version: string;
  publisher: string;
  description: string;
  icon?: string; // relative path within extension dir
  categories?: string[];
  engines?: { vscode: string };
  main?: string;
  contributes?: Record<string, unknown>;
  enabled: boolean;
  installedPath: string; // path to the extension/<publisher>.<name>-<version> folder
  extensionDir: string; // path to the extension/ subfolder (where package.json lives)
  activationEvents?: string[];
};

type ExtensionsStore = {
  enabled: Record<string, boolean>; // extensionId -> enabled
};

// ── Paths ──────────────────────────────────────────────────────────

function getExtensionsRoot(): string {
  // In development: workspace extensions dir
  // In production: app userData extensions dir
  if (app.isPackaged) {
    return join(app.getPath("userData"), "extensions");
  }
  return join(app.getAppPath(), "..", "extensions");
}

function getStorePath(): string {
  const root = getExtensionsRoot();
  return join(root, ".extensions-store.json");
}

// ── Store helpers ──────────────────────────────────────────────────

async function loadStore(): Promise<ExtensionsStore> {
  const storePath = getStorePath();
  try {
    const raw = await readFile(storePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { enabled: {} };
  }
}

async function saveStore(s: ExtensionsStore): Promise<void> {
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(s, null, 2), "utf-8");
}

// ── Scan installed extensions ──────────────────────────────────────

async function scanExtensions(): Promise<VSCodeExtension[]> {
  const root = getExtensionsRoot();
  const extStore = await loadStore();
  const results: VSCodeExtension[] = [];

  if (!existsSync(root)) return results;

  let entries: string[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const extFolder = entry.name; // e.g. "anthropic.claude-code-2.1.196-win32-x64"

    // Look for extension/ subfolder (standard VSIX layout)
    const extensionSubDir = join(root, extFolder, "extension");
    const pkgJsonPath = join(extensionSubDir, "package.json");

    if (!existsSync(pkgJsonPath)) continue;

    try {
      const raw = await readFile(pkgJsonPath, "utf-8");
      const pkg = JSON.parse(raw);

      const id = `${pkg.publisher ?? "unknown"}.${pkg.name ?? extFolder}`;
      const enabled = extStore.enabled[id] !== false; // default enabled

      results.push({
        id,
        name: pkg.name ?? extFolder,
        displayName: pkg.displayName ?? pkg.name ?? extFolder,
        version: pkg.version ?? "0.0.0",
        publisher: pkg.publisher ?? "unknown",
        description: pkg.description ?? "",
        icon: pkg.icon ?? undefined,
        categories: pkg.categories ?? [],
        engines: pkg.engines,
        main: pkg.main,
        contributes: pkg.contributes,
        enabled,
        installedPath: join(root, extFolder),
        extensionDir: extensionSubDir,
        activationEvents: pkg.activationEvents ?? [],
      });
    } catch {
      // Skip broken extensions
      continue;
    }
  }

  return results;
}

// ── Install from .vsix ─────────────────────────────────────────────

async function installExtension(
  vsixPath: string
): Promise<VSCodeExtension> {
  const root = getExtensionsRoot();
  await mkdir(root, { recursive: true });

  // Read .vsix (which is a ZIP file)
  const buffer = await readFile(vsixPath);
  const zipData = unzipSync(new Uint8Array(buffer));

  // Find package.json in the ZIP
  let pkgRaw: string | null = null;
  // VSIX files typically have "extension/package.json" at the root, or just "package.json"
  for (const [name, data] of Object.entries(zipData)) {
    if (name === "extension/package.json" || name === "package.json") {
      pkgRaw = Buffer.from(data as Uint8Array).toString("utf-8");
      break;
    }
  }

  if (!pkgRaw) {
    throw new Error("Invalid VSIX: no package.json found");
  }

  const pkg = JSON.parse(pkgRaw);
  const publisher = pkg.publisher ?? "unknown";
  const name = pkg.name ?? "unknown";
  const version = pkg.version ?? "0.0.0";
  const extId = `${publisher}.${name}`;
  const platform = process.platform; // win32, darwin, linux
  const arch = process.arch; // x64, arm64
  const folderName = `${publisher}.${name}-${version}-${platform}-${arch}`;

  const destDir = join(root, folderName);

  // Remove existing installation of same extension
  await removeOldVersions(root, publisher, name);

  // Extract all files
  await mkdir(destDir, { recursive: true });

  for (const [name, data] of Object.entries(zipData)) {
    // Normalize path: ensure extension/ prefix
    let relPath = name;
    if (!relPath.startsWith("extension/")) {
      relPath = "extension/" + relPath;
    }
    const outPath = join(destDir, relPath);
    // fflate unzipSync returns directories as zero-length Uint8Array
    const arr = data as Uint8Array;
    if (arr.length === 0 && name.endsWith("/")) {
      // It's a directory entry
      await mkdir(outPath, { recursive: true });
    } else {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, Buffer.from(arr));
    }
  }

  // Mark as enabled
  const extStore = await loadStore();
  extStore.enabled[extId] = true;
  await saveStore(extStore);

  const extensionSubDir = join(destDir, "extension");
  const icon = pkg.icon ?? undefined;

  return {
    id: extId,
    name: pkg.name ?? "unknown",
    displayName: pkg.displayName ?? pkg.name ?? "unknown",
    version: pkg.version ?? "0.0.0",
    publisher,
    description: pkg.description ?? "",
    icon,
    categories: pkg.categories ?? [],
    engines: pkg.engines,
    main: pkg.main,
    contributes: pkg.contributes,
    enabled: true,
    installedPath: destDir,
    extensionDir: extensionSubDir,
    activationEvents: pkg.activationEvents ?? [],
  };
}

async function removeOldVersions(
  root: string,
  publisher: string,
  name: string
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  const prefix = `${publisher}.${name}-`;
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(prefix)) {
      await rm(join(root, entry.name), { recursive: true, force: true });
    }
  }
}

async function uninstallExtension(extensionId: string): Promise<void> {
  const root = getExtensionsRoot();
  const extensions = await scanExtensions();
  const ext = extensions.find((e) => e.id === extensionId);
  if (!ext) throw new Error(`Extension not found: ${extensionId}`);

  await rm(ext.installedPath, { recursive: true, force: true });

  const extStore = await loadStore();
  delete extStore.enabled[extensionId];
  await saveStore(extStore);
}

async function setExtensionEnabled(
  extensionId: string,
  enabled: boolean
): Promise<void> {
  const extStore = await loadStore();
  extStore.enabled[extensionId] = enabled;
  await saveStore(extStore);
}

async function getExtensionIcon(
  extensionId: string
): Promise<string | null> {
  const extensions = await scanExtensions();
  const ext = extensions.find((e) => e.id === extensionId);
  if (!ext || !ext.icon) return null;

  const iconPath = join(ext.extensionDir, ext.icon);
  if (!existsSync(iconPath)) {
    // Try common icon names
    const commonIcons = ["icon.png", "icon.svg", "logo.png", "images/icon.png"];
    for (const ci of commonIcons) {
      const p = join(ext.extensionDir, ci);
      if (existsSync(p)) {
        const buf = await readFile(p);
        const ext = p.split(".").pop()?.toLowerCase();
        const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "png" ? "png" : "png"}`;
        return `data:${mime};base64,${buf.toString("base64")}`;
      }
    }
    return null;
  }

  const buf = await readFile(iconPath);
  const extn = ext.icon.split(".").pop()?.toLowerCase();
  const mime = extn === "svg" ? "image/svg+xml" : `image/${extn === "png" ? "png" : "png"}`;
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// ── Register handlers ──────────────────────────────────────────────

export function registerExtensionHandlers(win: BrowserWindow) {
  // List all installed extensions
  ipcMain.handle("extensions:list", async () => {
    return scanExtensions();
  });

  // Install from .vsix file dialog
  ipcMain.handle("extensions:installFromDialog", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Install Extension",
      filters: [
        { name: "VSIX Extensions", extensions: ["vsix"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const vsixPath = result.filePaths[0];
    const ext = await installExtension(vsixPath);
    return ext;
  });

  // Install from a given .vsix path (used by drag & drop)
  ipcMain.handle("extensions:install", async (_e, vsixPath: string) => {
    return installExtension(vsixPath);
  });

  // Uninstall
  ipcMain.handle(
    "extensions:uninstall",
    async (_e, extensionId: string) => {
      await uninstallExtension(extensionId);
    }
  );

  // Set enabled/disabled
  ipcMain.handle(
    "extensions:setEnabled",
    async (_e, extensionId: string, enabled: boolean) => {
      await setExtensionEnabled(extensionId, enabled);
    }
  );

  // Get extension icon as base64 data URL
  ipcMain.handle(
    "extensions:getIcon",
    async (_e, extensionId: string) => {
      return getExtensionIcon(extensionId);
    }
  );
}
