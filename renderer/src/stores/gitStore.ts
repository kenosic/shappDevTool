/**
 * Zustand store for Git version management state.
 */

import { create } from "zustand";
import type {
  GitCommitInfo,
  GitBranchInfo,
  GitStatusEntry,
  GitGraphData,
  TaskWithCheckpoints,
} from "../types/ipc";

// ── Types ─────────────────────────────────────────────────────────

/** A unified node displayed in the branch graph (commit + optional checkpoint metadata) */
export type BranchGraphNode = GitCommitInfo & {
  /** Which branches this commit belongs to (branch name → whether it's the tip) */
  branches: { name: string; isTip: boolean }[];
  /** Checkpoint metadata if this commit was auto-created by agent */
  checkpoint?: {
    taskId: string;
    taskTitle: string;
    fileCount: number;
  };
};

// ── State ─────────────────────────────────────────────────────────

type GitStoreState = {
  // Repo state
  repoExists: boolean;
  loading: boolean;
  error: string | null;

  // Commit history
  commits: GitCommitInfo[];
  // Branch refs with tip OIDs
  branchRefs: { name: string; tipOid: string; isCurrent: boolean }[];
  // Branches
  branches: GitBranchInfo[];
  currentBranch: string;
  // Working tree status
  statusEntries: GitStatusEntry[];

  // Checkpoint / tasks
  tasks: TaskWithCheckpoints[];

  // ── Graph nodes (derived from commits + branches + checkpoints) ──
  graphNodes: BranchGraphNode[];

  // ── Selected node ────────────────────────────────────────────────
  /** Currently selected commit OID (shown in simulator preview) */
  selectedOid: string | null;

  // Actions (只读查看)
  refresh: (projectDir: string) => Promise<void>;
  /** Atomically reload git data + checkpoint tasks in one set() call */
  fullRefresh: (projectDir: string) => Promise<void>;
  switchBranch: (projectDir: string, branchName: string) => Promise<void>;
  loadTasks: (projectDir: string) => Promise<void>;
  /** Auto-commit + create checkpoint, then fullRefresh */
  autoCommit: (projectDir: string, taskId: string, summary: string) => Promise<void>;
  /** Restore working tree to a commit and create a new agent session */
  restoreNode: (projectDir: string, oid: string) => Promise<void>;

  clearError: () => void;
};

/** Build graph nodes by correlating commits, branches, and checkpoint tasks */
function buildGraphNodes(
  commits: GitCommitInfo[],
  branchRefs: { name: string; tipOid: string; isCurrent: boolean }[],
  tasks: TaskWithCheckpoints[],
): BranchGraphNode[] {
  // Build a map: commitOid → checkpoint info
  const checkpointMap = new Map<string, BranchGraphNode["checkpoint"]>();
  for (const task of tasks) {
    for (const cp of task.checkpoints) {
      checkpointMap.set(cp.commit_oid, {
        taskId: task.id,
        taskTitle: task.title,
        fileCount: cp.file_count,
      });
    }
  }

  // Build a map: commitOid → set of branch names it's reachable from
  // We do a reverse BFS: from each branch tip, walk parent chain
  const commitBranchMap = new Map<string, Set<string>>();
  const tipOids = new Set(branchRefs.map((b) => b.tipOid));

  // Walk from each branch tip through parent chain
  for (const br of branchRefs) {
    const visited = new Set<string>();
    const queue = [br.tipOid];
    while (queue.length > 0) {
      const oid = queue.shift()!;
      if (visited.has(oid)) continue;
      visited.add(oid);
      if (!commitBranchMap.has(oid)) commitBranchMap.set(oid, new Set());
      commitBranchMap.get(oid)!.add(br.name);
      // Find commit and enqueue parents
      const commit = commits.find((c) => c.oid === oid);
      if (commit) {
        for (const p of commit.parentOids) queue.push(p);
      }
    }
  }

  return commits.map((c) => ({
    ...c,
    branches: [...(commitBranchMap.get(c.oid) ?? new Set())].map((name) => ({
      name,
      isTip: tipOids.has(c.oid),
    })),
    checkpoint: checkpointMap.get(c.oid),
  }));
}

export const useGitStore = create<GitStoreState>((set, get) => ({
  repoExists: false,
  loading: false,
  error: null,
  commits: [],
  branchRefs: [],
  branches: [],
  currentBranch: "main",
  statusEntries: [],
  tasks: [],
  graphNodes: [],
  selectedOid: null,

  // ── refresh ─────────────────────────────────────────────────
  refresh: async (projectDir) => {
    set({ loading: true, error: null });
    try {
      const [graphData, branches, currentBranch, statusEntries] = await Promise.all([
        window.devtool.git.graph(projectDir),
        window.devtool.git.listBranches(projectDir),
        window.devtool.git.currentBranch(projectDir),
        window.devtool.git.status(projectDir),
      ]);
      const tasks = get().tasks;
      const graphNodes = buildGraphNodes(graphData.commits, graphData.branches, tasks);
      set({
        repoExists: true,
        commits: graphData.commits,
        branchRefs: graphData.branches,
        branches,
        currentBranch,
        statusEntries,
        graphNodes,
        loading: false,
      });
    } catch {
      // Repo might not exist yet
      set({ repoExists: false, commits: [], branches: [], statusEntries: [], graphNodes: [], loading: false });
    }
  },

  // ── fullRefresh ─────────────────────────────────────────────
  /** Atomically reload git data AND checkpoint tasks in one set() call.
   *  Avoids the stale-data race where loadTasks builds graphNodes with
   *  old commits/branchRefs before refresh updates them. */
  fullRefresh: async (projectDir) => {
    set({ loading: true, error: null });
    try {
      const [graphData, branches, currentBranch, statusEntries, tasks] = await Promise.all([
        window.devtool.git.graph(projectDir),
        window.devtool.git.listBranches(projectDir),
        window.devtool.git.currentBranch(projectDir),
        window.devtool.git.status(projectDir),
        window.devtool.checkpoint.listTasksWithCheckpoints(projectDir).catch(() => [] as TaskWithCheckpoints[]),
      ]);
      const graphNodes = buildGraphNodes(graphData.commits, graphData.branches, tasks);
      set({
        repoExists: true,
        commits: graphData.commits,
        branchRefs: graphData.branches,
        branches,
        currentBranch,
        statusEntries,
        tasks,
        graphNodes,
        loading: false,
      });
    } catch {
      set({ repoExists: false, commits: [], branches: [], statusEntries: [], tasks: [], graphNodes: [], loading: false });
    }
  },

  // ── switchBranch ────────────────────────────────────────────
  switchBranch: async (projectDir, branchName) => {
    set({ loading: true, error: null });
    try {
      await window.devtool.git.switchBranch(projectDir, branchName);
      await get().refresh(projectDir);
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loading: false });
    }
  },

  // ── loadTasks ───────────────────────────────────────────────
  loadTasks: async (projectDir) => {
    try {
      const tasks = await window.devtool.checkpoint.listTasksWithCheckpoints(projectDir);
      const graphNodes = buildGraphNodes(get().commits, get().branchRefs, tasks);
      set({ tasks, graphNodes });
    } catch {
      set({ tasks: [] });
    }
  },

  // ── autoCommit ──────────────────────────────────────────────
  autoCommit: async (projectDir, taskId, summary) => {
    const result = await window.devtool.git.autoCommit(projectDir, taskId, summary);
    if (result) {
      // Use fullRefresh to atomically reload git data + checkpoint tasks
      await get().fullRefresh(projectDir);
    }
  },

  // ── restoreNode ─────────────────────────────────────────────
  restoreNode: async (projectDir, oid) => {
    set({ loading: true, error: null, selectedOid: oid });
    try {
      // Reset working tree to the target commit (simulator preview updates)
      await window.devtool.git.resetToCommit(projectDir, oid);

      // Refresh git state
      await get().refresh(projectDir);
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loading: false });
    }
  },

  // ── setters ─────────────────────────────────────────────────
  clearError: () => set({ error: null }),
}));
