/**
 * isomorphic-git service layer for the DevTool.
 *
 * Runs in the Electron main process (Node.js).
 * Manages a git repository *inside* the opened project directory
 * to track all file changes made by the AI agent.
 */

import * as git from "isomorphic-git";
import { fs } from "./gitFs";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────

export type GitCommitInfo = {
  oid: string;           // full SHA
  shortOid: string;      // short SHA (7 chars)
  message: string;
  author: { name: string; email: string };
  committedAt: number;   // unix ms
  parentOids: string[];
};

export type GitBranchInfo = {
  name: string;
  isCurrent: boolean;
  tipOid: string;
};

export type GitStatusEntry = {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
};

export type GitDiffEntry = {
  path: string;
  oldOid?: string;
  newOid?: string;
  changeType: "added" | "modified" | "deleted";
};

// ── Helpers ───────────────────────────────────────────────────────

const AGENT_NAME = "Shapp DevTool";
const AGENT_EMAIL = "devtool@shapp.local";

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Return the .git directory inside the project */
function gitDir(projectDir: string): string {
  return join(projectDir, ".git");
}

/** Check if a git repo exists */
async function repoExists(projectDir: string): Promise<boolean> {
  try {
    const dir = gitDir(projectDir);
    return existsSync(dir);
  } catch {
    return false;
  }
}

// ── Init ───────────────────────────────────────────────────────────

export async function gitInit(projectDir: string): Promise<string> {
  ensureDir(projectDir);

  // If a git repo already exists, check whether the directory is otherwise empty.
  // An empty directory with leftover .git from a previous session should be cleaned.
  const exists = await repoExists(projectDir);
  if (exists) {
    const entries = readdirSync(projectDir).filter((e) => e !== ".git");
    if (entries.length === 0) {
      // Directory is empty except for .git — wipe old history
      rmSync(gitDir(projectDir), { recursive: true, force: true });
    } else {
      return "already-initialized";
    }
  }

  await git.init({ fs, dir: projectDir, defaultBranch: "main" });

  // Create initial commit (empty tree) so we have a starting point
  const initialOid = await gitCommit(projectDir, "🌱 Initial commit (DevTool auto-init)", {
    allowEmpty: true,
  });

  return initialOid;
}

// ── Commit ─────────────────────────────────────────────────────────

export async function gitCommit(
  projectDir: string,
  message: string,
  opts?: { allowEmpty?: boolean }
): Promise<string> {
  if (!(await repoExists(projectDir))) {
    await gitInit(projectDir);
  }

  // Stage all changes
  await git.add({ fs, dir: projectDir, filepath: "." });

  const oid = await git.commit({
    fs,
    dir: projectDir,
    message,
    author: { name: AGENT_NAME, email: AGENT_EMAIL },
    ...(opts?.allowEmpty ? { allowEmpty: true } : {}),
  });

  return oid;
}

// ── Log / History ──────────────────────────────────────────────────

export async function gitLog(
  projectDir: string,
  opts?: { depth?: number; branch?: string }
): Promise<GitCommitInfo[]> {
  if (!(await repoExists(projectDir))) return [];

  const commits = await git.log({
    fs,
    dir: projectDir,
    depth: opts?.depth ?? 50,
    ref: opts?.branch ?? "main",
  });

  return commits.map((c) => ({
    oid: c.oid,
    shortOid: c.oid.slice(0, 7),
    message: c.commit.message,
    author: {
      name: c.commit.author.name,
      email: c.commit.author.email,
    },
    committedAt: c.commit.author.timestamp * 1000,
    parentOids: c.commit.parent as string[],
  }));
}

// ── Graph (full DAG across all branches) ───────────────────────────

export type GitGraphData = {
  commits: GitCommitInfo[];
  branches: { name: string; tipOid: string; isCurrent: boolean }[];
};

/**
 * Collect all commits across all branches into a unified DAG.
 * Returns commits sorted by time (newest first) with branch ref pointers.
 */
export async function gitGraph(projectDir: string): Promise<GitGraphData> {
  if (!(await repoExists(projectDir))) return { commits: [], branches: [] };

  const branchNames = await git.listBranches({ fs, dir: projectDir });
  const current = (await git.currentBranch({ fs, dir: projectDir })) as string || "main";

  // Collect branch tip OIDs
  const branchRefs: { name: string; tipOid: string; isCurrent: boolean }[] = [];
  for (const name of branchNames) {
    try {
      const tipOid = await git.resolveRef({ fs, dir: projectDir, ref: name });
      branchRefs.push({ name, tipOid, isCurrent: name === current });
    } catch { /* skip broken refs */ }
  }

  // Collect all commits from all branches into a Set keyed by OID
  const commitMap = new Map<string, GitCommitInfo>();

  for (const ref of branchNames) {
    try {
      const commits = await git.log({ fs, dir: projectDir, ref, depth: 200 });
      for (const c of commits) {
        if (!commitMap.has(c.oid)) {
          commitMap.set(c.oid, {
            oid: c.oid,
            shortOid: c.oid.slice(0, 7),
            message: c.commit.message,
            author: {
              name: c.commit.author.name,
              email: c.commit.author.email,
            },
            committedAt: c.commit.author.timestamp * 1000,
            parentOids: (c.commit.parent as string[]) ?? [],
          });
        }
      }
    } catch { /* skip unreachable refs */ }
  }

  // Sort by time descending (newest first)
  const commits = [...commitMap.values()].sort((a, b) => b.committedAt - a.committedAt);

  return { commits, branches: branchRefs };
}

// ── Status ─────────────────────────────────────────────────────────

export async function gitStatus(projectDir: string): Promise<GitStatusEntry[]> {
  if (!(await repoExists(projectDir))) return [];

  const statusMatrix = await git.statusMatrix({ fs, dir: projectDir });
  const entries: GitStatusEntry[] = [];

  for (const [filepath, head, workdir, stage] of statusMatrix) {
    let status: GitStatusEntry["status"] | null = null;
    // See: https://isomorphic-git.org/docs/en/statusMatrix
    if (head === 1 && workdir === 0 && stage === 1) status = "deleted";
    else if (head === 1 && workdir === 2 && stage === 1) status = "modified";
    else if (head === 1 && workdir === 0 && stage === 0) status = "deleted";
    else if (head === 0 && workdir === 0 && stage === 2) status = "added";
    else if (head === 0 && workdir === 2 && stage === 0) status = "untracked";
    else if (head === 0 && workdir === 2 && stage === 2) status = "added";
    else if (head === 1 && workdir === 2 && stage === 2) status = "modified";

    if (status) {
      entries.push({ path: filepath, status });
    }
  }

  return entries;
}

// ── Branch ─────────────────────────────────────────────────────────

export async function gitListBranches(projectDir: string): Promise<GitBranchInfo[]> {
  if (!(await repoExists(projectDir))) return [];

  const branches = await git.listBranches({ fs, dir: projectDir });
  const current = await git.currentBranch({ fs, dir: projectDir }) as string;

  const result: GitBranchInfo[] = [];
  for (const name of branches) {
    const resolved = await git.resolveRef({ fs, dir: projectDir, ref: name });
    result.push({
      name,
      isCurrent: name === current,
      tipOid: resolved,
    });
  }
  return result;
}

export async function gitCreateBranch(
  projectDir: string,
  branchName: string
): Promise<void> {
  if (!(await repoExists(projectDir))) {
    await gitInit(projectDir);
  }
  await git.branch({ fs, dir: projectDir, ref: branchName, checkout: true });
}

export async function gitSwitchBranch(
  projectDir: string,
  branchName: string
): Promise<void> {
  await git.checkout({ fs, dir: projectDir, ref: branchName });
}

export async function getCurrentBranch(projectDir: string): Promise<string> {
  if (!(await repoExists(projectDir))) return "main";
  return (await git.currentBranch({ fs, dir: projectDir })) as string || "main";
}

// ── Diff ───────────────────────────────────────────────────────────

export async function gitDiff(
  projectDir: string,
  oid1?: string,
  oid2?: string
): Promise<GitDiffEntry[]> {
  if (!(await repoExists(projectDir))) return [];

  // Default: compare working directory vs HEAD
  if (!oid1) {
    try {
      oid1 = await git.resolveRef({ fs, dir: projectDir, ref: "HEAD" });
    } catch {
      return []; // no commits yet
    }
  }

  const fileStates = await git.walk({
    fs,
    dir: projectDir,
    trees: oid2 ? [git.TREE({ ref: oid1 }), git.TREE({ ref: oid2 })] : [git.TREE({ ref: oid1 }), git.WORKDIR()],
    map: async (filepath, entries) => {
      if (filepath === ".") return null;
      const [A, B] = entries;
      if (!A && !B) return null;
      if (A && B && (await A.oid()) === (await B.oid())) return null;

      let changeType: GitDiffEntry["changeType"] = "modified";
      if (!A) changeType = "added";
      else if (!B) changeType = "deleted";

      return {
        path: filepath,
        oldOid: A ? await A.oid() : undefined,
        newOid: B ? await B.oid() : undefined,
        changeType,
      };
    },
  });

  return fileStates.filter(Boolean) as GitDiffEntry[];
}

// ── Revert ─────────────────────────────────────────────────────────

export async function gitRevertFile(
  projectDir: string,
  filepath: string
): Promise<void> {
  if (!(await repoExists(projectDir))) return;

  // Checkout the file from HEAD
  await git.checkout({
    fs,
    dir: projectDir,
    ref: "HEAD",
    filepaths: [filepath],
    force: true,
  });
}

export async function gitResetToCommit(
  projectDir: string,
  oid: string
): Promise<void> {
  if (!(await repoExists(projectDir))) return;

  // Hard reset: working tree + index = target commit
  await git.checkout({
    fs,
    dir: projectDir,
    ref: oid,
    force: true,
  });
}

// ── Remote (optional: connect to a real remote) ────────────────────

export async function gitPush(
  projectDir: string,
  remoteUrl: string,
  branch?: string
): Promise<void> {
  const http = require("isomorphic-git/http/node");
  const b = branch ?? (await getCurrentBranch(projectDir));
  await git.push({
    fs,
    http,
    dir: projectDir,
    remote: "origin",
    url: remoteUrl,
    ref: b,
    onAuth: () => ({ username: "token", password: "" }),
  });
}

export async function gitPull(
  projectDir: string,
  remoteUrl: string,
  branch?: string
): Promise<void> {
  const http = require("isomorphic-git/http/node");
  const b = branch ?? (await getCurrentBranch(projectDir));
  await git.pull({
    fs,
    http,
    dir: projectDir,
    remote: "origin",
    url: remoteUrl,
    ref: b,
    author: { name: AGENT_NAME, email: AGENT_EMAIL },
  });
}

// ── Auto-commit (called after agent completes a tool call) ─────────

export type AutoCommitResult = {
  oid: string;
  shortOid: string;
  message: string;
  fileCount: number;
  files: string[];
};

/**
 * Auto-commit after agent makes changes.
 * Returns commit info if a commit was made, null if nothing changed.
 */
export async function autoCommit(
  projectDir: string,
  context: { taskId: string; summary: string }
): Promise<AutoCommitResult | null> {
  if (!(await repoExists(projectDir))) {
    await gitInit(projectDir);
  }

  // Check if there are any changes
  const statusEntries = await gitStatus(projectDir);
  if (statusEntries.length === 0) return null;

  const files = statusEntries.map((s) => s.path);
  const message = context.summary;

  const oid = await gitCommit(projectDir, message);

  return {
    oid,
    shortOid: oid.slice(0, 7),
    message,
    fileCount: files.length,
    files,
  };
}
