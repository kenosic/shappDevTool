/**
 * SQLite-based checkpoint / task storage for the Git version management system.
 * Stores agent task metadata and checkpoint snapshots linked to git commits.
 */

import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

// ── Schema ────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,       -- UUID
  session_id  TEXT NOT NULL,          -- OpenCode session ID
  project_dir TEXT NOT NULL,          -- absolute path of opened project
  title       TEXT DEFAULT '',        -- human-readable summary
  status      TEXT DEFAULT 'running', -- running | completed | error
  created_at  INTEGER NOT NULL,       -- unix ms
  updated_at  INTEGER NOT NULL        -- unix ms
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id          TEXT PRIMARY KEY,       -- UUID
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  commit_oid  TEXT NOT NULL,          -- git commit SHA
  branch      TEXT NOT NULL,          -- git branch name
  summary     TEXT DEFAULT '',        -- human-readable description of this checkpoint
  file_count  INTEGER DEFAULT 0,     -- changed file count
  created_at  INTEGER NOT NULL        -- unix ms
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON checkpoints(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_dir);
`;

// ── Singleton ─────────────────────────────────────────────────────

let _db: Database.Database | null = null;

function getDbPath(): string {
  const dir = join(app.getPath("userData"), "devtool");
  mkdirSync(dir, { recursive: true });
  return join(dir, "checkpoints.db");
}

export function getCheckpointDb(): Database.Database {
  if (!_db) {
    _db = new Database(getDbPath());
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    _db.exec(SCHEMA);
  }
  return _db;
}

export function closeCheckpointDb(): void {
  _db?.close();
  _db = null;
}

// ── Types ─────────────────────────────────────────────────────────

export type TaskRow = {
  id: string;
  session_id: string;
  project_dir: string;
  title: string;
  status: string;
  created_at: number;
  updated_at: number;
};

export type CheckpointRow = {
  id: string;
  task_id: string;
  commit_oid: string;
  branch: string;
  summary: string;
  file_count: number;
  created_at: number;
};

// ── Task CRUD ─────────────────────────────────────────────────────

export function createTask(params: {
  id: string;
  sessionId: string;
  projectDir: string;
  title?: string;
}): TaskRow {
  const db = getCheckpointDb();
  const now = Date.now();
  // Use INSERT OR IGNORE to avoid destroying existing checkpoints via ON DELETE CASCADE
  // when the same taskId is reused across multiple query rounds.
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(params.id) as TaskRow | undefined;
  if (existing) {
    // Task already exists — just bump updated_at, don't overwrite status or created_at
    db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(now, params.id);
    return existing;
  }
  db.prepare(
    `INSERT INTO tasks (id, session_id, project_dir, title, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?)`
  ).run(params.id, params.sessionId, params.projectDir, params.title ?? "", now, now);
  return {
    id: params.id,
    session_id: params.sessionId,
    project_dir: params.projectDir,
    title: params.title ?? "",
    status: "running",
    created_at: now,
    updated_at: now,
  };
}

export function updateTaskStatus(id: string, status: "running" | "completed" | "error"): void {
  const db = getCheckpointDb();
  db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, Date.now(), id);
}

export function getTask(id: string): TaskRow | undefined {
  const db = getCheckpointDb();
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
}

export function listTasks(projectDir: string): TaskRow[] {
  const db = getCheckpointDb();
  return db.prepare(
    "SELECT * FROM tasks WHERE project_dir = ? ORDER BY updated_at DESC LIMIT 100"
  ).all(projectDir) as TaskRow[];
}

export function deleteTask(id: string): void {
  const db = getCheckpointDb();
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

// ── Checkpoint CRUD ───────────────────────────────────────────────

export function createCheckpoint(params: {
  id: string;
  taskId: string;
  commitOid: string;
  branch: string;
  summary?: string;
  fileCount?: number;
}): CheckpointRow {
  const db = getCheckpointDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO checkpoints (id, task_id, commit_oid, branch, summary, file_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(params.id, params.taskId, params.commitOid, params.branch, params.summary ?? "", params.fileCount ?? 0, now);
  return {
    id: params.id,
    task_id: params.taskId,
    commit_oid: params.commitOid,
    branch: params.branch,
    summary: params.summary ?? "",
    file_count: params.fileCount ?? 0,
    created_at: now,
  };
}

export function listCheckpoints(taskId: string): CheckpointRow[] {
  const db = getCheckpointDb();
  return db.prepare(
    "SELECT * FROM checkpoints WHERE task_id = ? ORDER BY created_at ASC"
  ).all(taskId) as CheckpointRow[];
}

export function getLatestCheckpoint(taskId: string): CheckpointRow | undefined {
  const db = getCheckpointDb();
  return db.prepare(
    "SELECT * FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(taskId) as CheckpointRow | undefined;
}

// ── Combined queries ──────────────────────────────────────────────

export type TaskWithCheckpoints = TaskRow & { checkpoints: CheckpointRow[] };

export function getTaskWithCheckpoints(taskId: string): TaskWithCheckpoints | undefined {
  const task = getTask(taskId);
  if (!task) return undefined;
  return { ...task, checkpoints: listCheckpoints(taskId) };
}

export function listTasksWithCheckpoints(projectDir: string): TaskWithCheckpoints[] {
  const tasks = listTasks(projectDir);
  return tasks.map((t) => ({ ...t, checkpoints: listCheckpoints(t.id) }));
}
