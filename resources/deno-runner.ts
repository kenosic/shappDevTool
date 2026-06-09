/**
 * Shapp DevTool — Deno Runner Script
 *
 * This script runs as a standalone Deno process spawned by the Electron main
 * process. It receives a single JSON request from stdin, executes the app's
 * backend entry file, and writes structured JSON lines to stdout.
 *
 * Protocol:
 *   stdin:  { id, appDir, entryFile, method, params, mockContext, dbPath }
 *   stdout: { type:"log", level, message, ts }  (0..N lines)
 *           { type:"result", data, duration_ms } or { type:"error", code, message, duration_ms }
 */

// @ts-nocheck — running as a Deno script; TypeScript types are advisory only

import { join, resolve, dirname, fromFileUrl } from "jsr:@std/path";
import { Database } from "jsr:@db/sqlite@^0.12";

// ── Logging intercept ─────────────────────────────────────────────

const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);
const _origInfo = console.info.bind(console);

function emit(obj: unknown) {
  _origLog(JSON.stringify(obj));
}

function formatArgs(...args: unknown[]): string {
  return args
    .map((a) =>
      typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)
    )
    .join(" ");
}

console.log = (...args: unknown[]) =>
  emit({ type: "log", level: "log", message: formatArgs(...args), ts: Date.now() });
console.warn = (...args: unknown[]) =>
  emit({ type: "log", level: "warn", message: formatArgs(...args), ts: Date.now() });
console.error = (...args: unknown[]) =>
  emit({ type: "log", level: "error", message: formatArgs(...args), ts: Date.now() });
console.info = (...args: unknown[]) =>
  emit({ type: "log", level: "info", message: formatArgs(...args), ts: Date.now() });

// ── MARS SDK Shim ─────────────────────────────────────────────────

class MarsException extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(error: { code: string; message: string; details?: Record<string, unknown> }) {
    super(error.message);
    this.name = "MarsException";
    this.code = error.code;
    this.details = error.details ?? {};
  }
}

function exceptionToMarsError(err: unknown): { code: string; message: string; details: Record<string, unknown> } {
  if (err instanceof MarsException) {
    return { code: err.code, message: err.message, details: err.details };
  }
  return {
    code: "INTERNAL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    details: {},
  };
}

const MARS_SDK_SHIM = {
  serve(handler: unknown) {
    (globalThis as Record<string, unknown>).__marsHandler = handler;
  },
  MarsException,
  exceptionToMarsError,
};

// ── DB Implementation (SQLite via jsr:@db/sqlite) ─────────────────

function buildMarsDB(dbPath: string, grantedScopes: string[]) {
  const db = new Database(dbPath, { create: true });

  function hasDbScope(table: string, op: "read" | "write"): boolean {
    if (grantedScopes.includes("db.*")) return true;
    if (grantedScopes.includes(`db.${table}.${op}`)) return true;
    return false;
  }

  return {
    async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...(params ?? []));
        return rows as T[];
      } catch (err) {
        throw new MarsException({
          code: "DB_QUERY_ERROR",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },

    async execute(sql: string, params?: unknown[]): Promise<void> {
      try {
        db.prepare(sql).run(...(params ?? []));
      } catch (err) {
        throw new MarsException({
          code: "DB_EXECUTE_ERROR",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },

    async read<T = unknown>(
      table: string,
      filter?: Record<string, unknown>
    ): Promise<T[]> {
      if (!hasDbScope(table, "read")) {
        throw new MarsException({
          code: "PERMISSION_DENIED",
          message: `Missing scope: db.${table}.read`,
        });
      }
      if (!filter || Object.keys(filter).length === 0) {
        return db.prepare(`SELECT * FROM "${table}"`).all() as T[];
      }
      const keys = Object.keys(filter);
      const where = keys.map((k) => `"${k}" = ?`).join(" AND ");
      const vals = keys.map((k) => filter[k]);
      return db.prepare(`SELECT * FROM "${table}" WHERE ${where}`).all(...vals) as T[];
    },

    async write<T = unknown>(
      table: string,
      payload: Record<string, unknown>
    ): Promise<void> {
      if (!hasDbScope(table, "write")) {
        throw new MarsException({
          code: "PERMISSION_DENIED",
          message: `Missing scope: db.${table}.write`,
        });
      }
      const keys = Object.keys(payload);
      const placeholders = keys.map(() => "?").join(", ");
      const cols = keys.map((k) => `"${k}"`).join(", ");
      const vals = keys.map((k) => payload[k]);
      db.prepare(`INSERT OR REPLACE INTO "${table}" (${cols}) VALUES (${placeholders})`).run(...vals);
    },
  };
}

// ── KV Implementation ─────────────────────────────────────────────

function buildMarsKv(dbPath: string) {
  const db = new Database(dbPath, { create: true });

  // Ensure the KV table exists
  db.prepare(
    `CREATE TABLE IF NOT EXISTS shapp_kv (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL,
       updated_at INTEGER NOT NULL
     )`
  ).run();

  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const row = db.prepare("SELECT value FROM shapp_kv WHERE key = ?").get(key) as
        | { value: string }
        | undefined;
      if (row === undefined) return undefined;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return row.value as unknown as T;
      }
    },

    async set(key: string, value: unknown): Promise<void> {
      db.prepare(
        `INSERT INTO shapp_kv (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(key, JSON.stringify(value), Date.now());
    },

    async delete(key: string): Promise<void> {
      db.prepare("DELETE FROM shapp_kv WHERE key = ?").run(key);
    },

    async list(): Promise<Array<{ key: string; value: unknown; updatedAt: number }>> {
      const rows = db.prepare("SELECT key, value, updated_at FROM shapp_kv ORDER BY key").all() as Array<{
        key: string;
        value: string;
        updated_at: number;
      }>;
      return rows.map((r) => {
        let parsed: unknown;
        try { parsed = JSON.parse(r.value); } catch { parsed = r.value; }
        return { key: r.key, value: parsed, updatedAt: r.updated_at };
      });
    },

    async clear(): Promise<void> {
      db.prepare("DELETE FROM shapp_kv").run();
    },
  };
}

// ── Auth Implementation ───────────────────────────────────────────

function buildMarsAuth(mockContext: Record<string, unknown>) {
  const userId = mockContext.userId as string | undefined;
  const mockUser = userId
    ? {
        id: userId,
        roles: (mockContext.roles as string[]) ?? [],
        nickname: (mockContext.nickname as string) ?? "DevUser",
        avatar: null,
        email: null,
        phone: null,
      }
    : null;

  return {
    async getUser() {
      return mockUser;
    },
    async requireUser() {
      if (!mockUser) {
        throw new MarsException({ code: "UNAUTHENTICATED", message: "No user in mock context" });
      }
      return mockUser;
    },
  };
}

// ── HTTP Implementation ─────────────────────────────────────────

function buildMarsHttp() {
  return {
    fetch: (input: string | URL, init?: RequestInit) => fetch(input, init),
  };
}

// ── Storage implementation (local .devtool/storage/) ─────────────

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  pdf: "application/pdf", txt: "text/plain", json: "application/json",
  mp4: "video/mp4", mp3: "audio/mpeg", wav: "audio/wav",
};

function sanitizeStorageKey(key: string): string {
  return key
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p.length > 0 && p !== "." && p !== "..")
    .join("/");
}

function buildMarsStorage(appDir: string, serverBaseUrl: string | null) {
  const storageDir = join(appDir, ".devtool", "storage");

  async function ensureParentDir(filePath: string): Promise<void> {
    const dir = filePath.replace(/[/\\][^/\\]*$/, "");
    await Deno.mkdir(dir, { recursive: true });
  }

  return {
    async put(key: string, value: Blob | Uint8Array): Promise<void> {
      const safeKey = sanitizeStorageKey(key);
      if (!safeKey) {
        throw new MarsException({ code: "INVALID_KEY", message: "Storage key is empty or invalid" });
      }
      const filePath = join(storageDir, safeKey);
      await ensureParentDir(filePath);
      let data: Uint8Array;
      if (value instanceof Uint8Array) {
        data = value;
      } else {
        data = new Uint8Array(await (value as Blob).arrayBuffer());
      }
      await Deno.writeFile(filePath, data);
    },

    async get(key: string): Promise<Blob | null> {
      const safeKey = sanitizeStorageKey(key);
      if (!safeKey) return null;
      const filePath = join(storageDir, safeKey);
      try {
        const data = await Deno.readFile(filePath);
        const ext = safeKey.split(".").pop()?.toLowerCase() ?? "";
        const mime = EXT_MIME[ext] ?? "application/octet-stream";
        return new Blob([data], { type: mime });
      } catch {
        return null;
      }
    },

    async delete(key: string): Promise<void> {
      const safeKey = sanitizeStorageKey(key);
      if (!safeKey) return;
      const filePath = join(storageDir, safeKey);
      try {
        await Deno.remove(filePath);
      } catch {
        // File may not exist, ignore
      }
    },

    async getSignedUrl(key: string, _expiresInSeconds: number): Promise<string> {
      const safeKey = sanitizeStorageKey(key);
      if (!safeKey) {
        throw new MarsException({ code: "INVALID_KEY", message: "Storage key is empty or invalid" });
      }
      // If the static server is running, return an HTTP URL (served via /.devtool/storage/ route)
      if (serverBaseUrl) {
        return `${serverBaseUrl}/.devtool/storage/${safeKey}`;
      }
      // Fallback: build a data URL so the image is still usable
      const filePath = join(storageDir, safeKey);
      try {
        const data = await Deno.readFile(filePath);
        const ext = safeKey.split(".").pop()?.toLowerCase() ?? "";
        const mime = EXT_MIME[ext] ?? "application/octet-stream";
        // btoa on large binary: use a chunk approach safe for Deno
        let binary = "";
        const chunk = 8192;
        for (let i = 0; i < data.length; i += chunk) {
          binary += String.fromCharCode(...data.subarray(i, i + chunk));
        }
        return `data:${mime};base64,${btoa(binary)}`;
      } catch {
        throw new MarsException({ code: "NOT_FOUND", message: `Storage key not found: ${key}` });
      }
    },
  };
}

// ── App loader (mirrors production loadAppHandler) ────────────────

async function loadAppHandler(entryPath: string): Promise<unknown | null> {
  (globalThis as Record<string, unknown>).__marsHandler = undefined;
  (globalThis as Record<string, unknown>).__mars_sdk__ = MARS_SDK_SHIM;

  const absPath = resolve(entryPath);

  // Read source and replace @mars/sdk import with shim
  let source: string;
  try {
    source = await Deno.readTextFile(absPath);
  } catch (err) {
    throw new Error(`Cannot read entry file: ${absPath} — ${err}`);
  }

  const stripped = source.replace(
    /^\s*import\s+(?:type\s+)?\{[^}]*\}\s*from\s+["']@mars\/sdk["'];?\s*$/gm,
    ""
  );
  const transformed = `// @ts-nocheck\nconst { serve, MarsException, exceptionToMarsError } = (globalThis).__mars_sdk__;\n${stripped}`;

  const dir = absPath.replace(/[/\\][^/\\]*$/, "");
  const tempPath = join(dir, `__devtool_runner_${Date.now()}.ts`);
  await Deno.writeTextFile(tempPath, transformed);

  try {
    const fileUrl = `file:///${tempPath.replace(/\\/g, "/")}`;
    await import(fileUrl);
  } finally {
    await Deno.remove(tempPath).catch(() => {});
  }

  const handler = (globalThis as Record<string, unknown>).__marsHandler;
  if (!handler) {
    throw new Error(`Entry file did not call serve(): ${absPath}`);
  }
  return handler;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  // Read single JSON line from stdin
  const decoder = new TextDecoder();
  let inputStr = "";
  for await (const chunk of Deno.stdin.readable) {
    inputStr += decoder.decode(chunk);
  }

  let request: {
    id: string;
    appDir: string;
    entryFile: string;
    method: string;
    params: unknown;
    mockContext: Record<string, unknown>;
    dbPath: string;
  };

  try {
    request = JSON.parse(inputStr.trim());
  } catch (err) {
    emit({
      type: "error",
      code: "INVALID_REQUEST",
      message: `Failed to parse request: ${err}`,
      duration_ms: 0,
    });
    Deno.exit(1);
  }

  const { appDir, entryFile, method, params, mockContext, dbPath, serverUrl } = request as typeof request & { serverUrl?: string };

  const entryAbsPath = entryFile.startsWith("/") || /^[A-Za-z]:/.test(entryFile)
    ? entryFile
    : join(appDir, entryFile);

  const grantedScopes = (mockContext.scopes as string[] | undefined) ?? ["db.*"];

  const startTs = Date.now();

  try {
    const handler = await loadAppHandler(entryAbsPath) as {
      rpc?: (method: string, params: unknown, ctx: unknown) => Promise<unknown>;
    };

    if (typeof handler.rpc !== "function") {
      throw new Error("Handler does not export an rpc() function");
    }

    const marsCtx = {
      requestId: `devtool_${Date.now()}`,
      isAdmin: !!(mockContext.isAdmin),
      db: buildMarsDB(dbPath, grantedScopes),
      kv: buildMarsKv(dbPath),
      storage: buildMarsStorage(appDir, (serverUrl as string | undefined) ?? null),
      auth: buildMarsAuth(mockContext),
      http: buildMarsHttp(),
      env: {},
    };

    // Intercept built-in methods exactly as the hosting-api's rpc.ts does,
    // so devTool behaviour is identical to production (portal).
    // Mini-app backends that re-implement these methods are bypassed in production
    // and will now be bypassed here too — exposing any divergence early.
    let data: unknown;
    if (method === "auth.getUser") {
      data = { user: await marsCtx.auth.getUser() };
    } else if (method === "auth.requireUser") {
      data = { user: await marsCtx.auth.requireUser() };
    } else {
      data = await handler.rpc(method, params, marsCtx);
    }
    const durationMs = Date.now() - startTs;

    emit({ type: "result", data, duration_ms: durationMs });
  } catch (err) {
    const durationMs = Date.now() - startTs;
    const marsErr = exceptionToMarsError(err);
    emit({ type: "error", ...marsErr, duration_ms: durationMs });
    Deno.exit(1);
  }
}

await main();
