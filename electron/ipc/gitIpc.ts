/**
 * IPC handlers for Git version management.
 * Bridges isomorphic-git service + SQLite checkpoint storage → renderer.
 */

import { ipcMain, BrowserWindow } from "electron";
import { randomUUID } from "crypto";
import {
  gitInit,
  gitCommit,
  gitLog,
  gitGraph,
  gitStatus,
  gitListBranches,
  gitCreateBranch,
  gitSwitchBranch,
  gitDiff,
  gitRevertFile,
  gitResetToCommit,
  getCurrentBranch,
  autoCommit,
  type AutoCommitResult,
  type GitCommitInfo,
  type GitBranchInfo,
  type GitStatusEntry,
  type GitDiffEntry,
  type GitGraphData,
} from "./gitService";
import {
  getCheckpointDb,
  closeCheckpointDb,
  createTask,
  updateTaskStatus,
  getTask,
  listTasks,
  deleteTask,
  createCheckpoint,
  listCheckpoints,
  getTaskWithCheckpoints,
  listTasksWithCheckpoints,
  type TaskRow,
  type CheckpointRow,
  type TaskWithCheckpoints,
} from "./checkpoint";

// ── Register ───────────────────────────────────────────────────────

export function registerGitHandlers(win: BrowserWindow): void {
  // ── Git: Init ─────────────────────────────────────────────────
  ipcMain.handle("git:init", async (_e, projectDir: string): Promise<string> => {
    return gitInit(projectDir);
  });

  // ── Git: Commit ───────────────────────────────────────────────
  ipcMain.handle("git:commit", async (_e, projectDir: string, message: string): Promise<string> => {
    return gitCommit(projectDir, message);
  });

  // ── Git: Log ──────────────────────────────────────────────────
  ipcMain.handle("git:log", async (_e, projectDir: string, depth?: number, branch?: string): Promise<GitCommitInfo[]> => {
    return gitLog(projectDir, { depth, branch });
  });

  // ── Git: Graph (full DAG across all branches) ─────────────────
  ipcMain.handle("git:graph", async (_e, projectDir: string): Promise<GitGraphData> => {
    return gitGraph(projectDir);
  });

  // ── Git: Status ───────────────────────────────────────────────
  ipcMain.handle("git:status", async (_e, projectDir: string): Promise<GitStatusEntry[]> => {
    return gitStatus(projectDir);
  });

  // ── Git: Branches ─────────────────────────────────────────────
  ipcMain.handle("git:listBranches", async (_e, projectDir: string): Promise<GitBranchInfo[]> => {
    return gitListBranches(projectDir);
  });

  ipcMain.handle("git:createBranch", async (_e, projectDir: string, branchName: string): Promise<void> => {
    return gitCreateBranch(projectDir, branchName);
  });

  ipcMain.handle("git:switchBranch", async (_e, projectDir: string, branchName: string): Promise<void> => {
    return gitSwitchBranch(projectDir, branchName);
  });

  ipcMain.handle("git:currentBranch", async (_e, projectDir: string): Promise<string> => {
    return getCurrentBranch(projectDir);
  });

  // ── Git: Diff ─────────────────────────────────────────────────
  ipcMain.handle("git:diff", async (_e, projectDir: string, oid1?: string, oid2?: string): Promise<GitDiffEntry[]> => {
    return gitDiff(projectDir, oid1, oid2);
  });

  // ── Git: Revert ───────────────────────────────────────────────
  ipcMain.handle("git:revertFile", async (_e, projectDir: string, filepath: string): Promise<void> => {
    return gitRevertFile(projectDir, filepath);
  });

  ipcMain.handle("git:resetToCommit", async (_e, projectDir: string, oid: string): Promise<void> => {
    return gitResetToCommit(projectDir, oid);
  });

  // ── Git: Auto-commit ──────────────────────────────────────────
  ipcMain.handle("git:autoCommit", async (_e, projectDir: string, taskId: string, summary: string): Promise<AutoCommitResult | null> => {
    console.log("[gitIpc] autoCommit called: taskId=", taskId, "summary=", summary.slice(0, 50));
    const result = await autoCommit(projectDir, { taskId, summary });
    if (result) {
      console.log("[gitIpc] autoCommit result:", result.shortOid, result.fileCount, "files");
      // Ensure a task record exists (idempotent — won't overwrite existing)
      createTask({
        id: taskId,
        sessionId: taskId,
        projectDir,
        title: summary.slice(0, 80),
      });
      // Also create a checkpoint record in SQLite
      const branch = await getCurrentBranch(projectDir);
      createCheckpoint({
        id: randomUUID(),
        taskId,
        commitOid: result.oid,
        branch,
        summary,
        fileCount: result.fileCount,
      });
      console.log("[gitIpc] checkpoint created on branch:", branch);
    } else {
      console.log("[gitIpc] autoCommit: no changes to commit");
    }
    return result;
  });

  // ── Checkpoint: Tasks ─────────────────────────────────────────
  ipcMain.handle("checkpoint:createTask", async (_e, sessionId: string, projectDir: string, title?: string): Promise<TaskRow> => {
    return createTask({ id: randomUUID(), sessionId, projectDir, title });
  });

  ipcMain.handle("checkpoint:updateTaskStatus", async (_e, id: string, status: "running" | "completed" | "error"): Promise<void> => {
    updateTaskStatus(id, status);
  });

  ipcMain.handle("checkpoint:getTask", async (_e, id: string): Promise<TaskRow | undefined> => {
    return getTask(id);
  });

  ipcMain.handle("checkpoint:listTasks", async (_e, projectDir: string): Promise<TaskRow[]> => {
    return listTasks(projectDir);
  });

  ipcMain.handle("checkpoint:deleteTask", async (_e, id: string): Promise<void> => {
    deleteTask(id);
  });

  // ── Checkpoint: Checkpoints ───────────────────────────────────
  ipcMain.handle("checkpoint:listCheckpoints", async (_e, taskId: string): Promise<CheckpointRow[]> => {
    return listCheckpoints(taskId);
  });

  ipcMain.handle("checkpoint:getTaskWithCheckpoints", async (_e, taskId: string): Promise<TaskWithCheckpoints | undefined> => {
    return getTaskWithCheckpoints(taskId);
  });

  ipcMain.handle("checkpoint:listTasksWithCheckpoints", async (_e, projectDir: string): Promise<TaskWithCheckpoints[]> => {
    return listTasksWithCheckpoints(projectDir);
  });
}

export { closeCheckpointDb };
