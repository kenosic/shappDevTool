import { ipcMain, BrowserWindow } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { spawn, ChildProcess } from "child_process";
import { app } from "electron";

// ── Types ─────────────────────────────────────────────────────────

export type RunParams = {
  appDir: string;
  entryFile: string;
  method: string;
  params: unknown;
  mockContext: {
    userId?: string;
    deviceId?: string;
    scopes?: string[];
  };
};

export type LogEntry = {
  level: "log" | "warn" | "error" | "info";
  message: string;
  ts: number;
};

export type RunResult = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  durationMs: number;
};

// ── State ─────────────────────────────────────────────────────────

let currentProcess: ChildProcess | null = null;
let runnerWindow: BrowserWindow | null = null;
let getServerUrl: (() => string | null) | null = null;

export function setServerUrlGetter(fn: () => string | null): void {
  getServerUrl = fn;
}

// ── Deno runner path resolution ───────────────────────────────────

function getDenoPath(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (app.isPackaged) {
    const resourcesDir = process.resourcesPath;
    const ext = platform === "win32" ? ".exe" : "";
    const suffix = arch === "arm64" ? "arm64" : "x64";
    return join(resourcesDir, "deno", `deno-${platform}-${suffix}${ext}`);
  }

  // Dev mode: use system deno
  return "deno";
}

function getRunnerScriptPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "deno-runner.ts");
  }
  return join(app.getAppPath(), "resources", "deno-runner.ts");
}

// ── Execution ─────────────────────────────────────────────────────

async function ensureDevtoolDir(appDir: string): Promise<string> {
  const devtoolDir = join(appDir, ".devtool");
  await mkdir(devtoolDir, { recursive: true });
  return devtoolDir;
}

function parseRunnerLine(
  line: string,
  win: BrowserWindow
): RunResult | null {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }

  if (msg.type === "log") {
    const entry: LogEntry = {
      level: (msg.level as LogEntry["level"]) ?? "log",
      message: String(msg.message ?? ""),
      ts: (msg.ts as number) ?? Date.now(),
    };
    win.webContents.send("execution:log", entry);
    return null;
  }

  if (msg.type === "result") {
    return {
      ok: true,
      data: msg.data,
      durationMs: (msg.duration_ms as number) ?? 0,
    };
  }

  if (msg.type === "error") {
    return {
      ok: false,
      error: {
        code: String(msg.code ?? "EXECUTION_ERROR"),
        message: String(msg.message ?? "Unknown error"),
      },
      durationMs: (msg.duration_ms as number) ?? 0,
    };
  }

  return null;
}

async function executeWithDeno(
  params: RunParams,
  win: BrowserWindow
): Promise<RunResult> {
  const denoPath = getDenoPath();
  const runnerScript = getRunnerScriptPath();
  const devtoolDir = await ensureDevtoolDir(params.appDir);
  const dbPath = join(devtoolDir, "state.db");

  if (app.isPackaged && !existsSync(denoPath)) {
    return {
      ok: false,
      error: {
        code: "MISSING_DENO_BINARY",
        message:
          `Packaged Deno runtime not found: ${denoPath}. Rebuild the Windows bundle with pnpm run pack:win or ../../scripts/build-devtool-win.ps1.`,
      },
      durationMs: 0,
    };
  }

  return new Promise((resolve) => {
    const requestPayload = JSON.stringify({
      id: `req_${Date.now()}`,
      appDir: params.appDir,
      entryFile: params.entryFile,
      method: params.method,
      params: params.params,
      mockContext: params.mockContext,
      dbPath,
      serverUrl: getServerUrl?.() ?? null,
    });

    const childProc = spawn(
      denoPath,
      ["run", "--allow-all", "--no-check", runnerScript],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          DENO_NO_UPDATE_CHECK: "1",
        },
      }
    );

    currentProcess = childProc;

    let stdoutBuf = "";
    let result: RunResult | null = null;
    const startTs = Date.now();

    childProc.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString("utf-8");
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = parseRunnerLine(trimmed, win);
        if (parsed) result = parsed;
      }
    });

    childProc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8").trim();
      if (text) {
        const entry: LogEntry = {
          level: "error",
          message: `[Deno stderr] ${text}`,
          ts: Date.now(),
        };
        win.webContents.send("execution:log", entry);
      }
    });

    childProc.on("close", (code) => {
      currentProcess = null;
      const durationMs = Date.now() - startTs;

      if (result) {
        resolve(result);
      } else if (code === null || code === 0) {
        resolve({ ok: true, data: null, durationMs });
      } else {
        resolve({
          ok: false,
          error: { code: "PROCESS_EXIT", message: `Deno exited with code ${code}` },
          durationMs,
        });
      }
    });

    childProc.on("error", (err) => {
      currentProcess = null;
      resolve({
        ok: false,
        error: { code: "SPAWN_ERROR", message: err.message },
        durationMs: Date.now() - startTs,
      });
    });

    // Write request to stdin and close it
    childProc.stdin.write(requestPayload + "\n");
    childProc.stdin.end();
  });
}

// ── IPC Registration ──────────────────────────────────────────────

export function registerExecutionHandlers(win: BrowserWindow): void {
  runnerWindow = win;

  ipcMain.handle("execution:run", async (_e, params: RunParams) => {
    if (currentProcess) {
      currentProcess.kill("SIGKILL");
      currentProcess = null;
    }

    win.webContents.send("execution:status", "running");

    try {
      const result = await executeWithDeno(params, win);
      win.webContents.send("execution:status", result.ok ? "idle" : "error");
      return result;
    } catch (err) {
      win.webContents.send("execution:status", "error");
      return {
        ok: false,
        error: {
          code: "UNEXPECTED",
          message: err instanceof Error ? err.message : String(err),
        },
        durationMs: 0,
      };
    }
  });

  ipcMain.handle("execution:cancel", () => {
    if (currentProcess) {
      currentProcess.kill("SIGKILL");
      currentProcess = null;
      win.webContents.send("execution:status", "idle");
    }
  });

  ipcMain.handle("execution:isRunning", () => {
    return currentProcess !== null;
  });
}
