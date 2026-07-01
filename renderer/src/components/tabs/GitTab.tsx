/**
 * GitTab — 版本树可视化。
 * 以图形化树形结构展示所有分支的提交历史。
 * 当前运行的分支为主分支（最左侧）。
 */

import React, { useEffect, useCallback, useState, useMemo } from "react";
import { usePackageStore } from "../../stores/packageStore";
import { useGitStore } from "../../stores/gitStore";
import { useT } from "../../i18n";
import { computeGraphLayout, type GraphNode } from "../../utils/gitGraphLayout";
import type { GitCommitInfo, GitDiffEntry } from "../../types/ipc";
import styles from "./GitTab.module.css";

// ── 常量 ─────────────────────────────────────────────────────────

const ROW_HEIGHT = 56;
const LANE_WIDTH = 24;
const DOT_RADIUS = 4;
const GRAPH_PAD_LEFT = 8;

// ── Helpers ───────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_TAG_CLASS: Record<string, string> = {
  added: styles.tagAdded,
  modified: styles.tagModified,
  deleted: styles.tagDeleted,
  untracked: styles.tagUntracked,
};

// ── Graph SVG renderer ────────────────────────────────────────────

function GraphSvg({ nodes, totalLanes }: { nodes: GraphNode[]; totalLanes: number }) {
  if (nodes.length === 0) return null;

  const width = totalLanes * LANE_WIDTH + GRAPH_PAD_LEFT * 2;
  const height = nodes.length * ROW_HEIGHT;

  // Build a map: oid → row index
  const oidToRow = new Map<string, number>();
  nodes.forEach((n, i) => oidToRow.set(n.commit.oid, i));

  // Center X for a lane
  function laneX(lane: number): number {
    return GRAPH_PAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
  }

  const lines: React.ReactNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    const cx = laneX(node.lane);

    for (const link of node.parentLinks) {
      const parentRow = oidToRow.get(link.oid);
      if (parentRow === undefined) continue;

      const py = parentRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const pLane = link.toLane;
      const fromX = laneX(link.fromLane);
      const toX = laneX(pLane);

      // Draw the connecting path
      const midY = (y + py) / 2;
      const pathD = link.fromLane === pLane
        ? `M ${fromX} ${y} L ${fromX} ${py}` // straight vertical
        : `M ${fromX} ${y} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${py}`; // L-shaped

      lines.push(
        <path
          key={`line-${node.commit.oid}-${link.oid}`}
          d={pathD}
          stroke="var(--graph-line, #c8ccd0)"
          strokeWidth={1.5}
          fill="none"
        />
      );
    }

    // Draw the commit dot
    const isCurrentBranch = node.branchLabels.some((b) => b.isCurrent);
    const dotColor = isCurrentBranch
      ? "var(--accent-color, #007acc)"
      : node.branchLabels.length > 0
        ? "var(--graph-branch, #4caf50)"
        : "var(--graph-dot, #a0a4a8)";

    lines.push(
      <circle key={`dot-${node.commit.oid}`} cx={cx} cy={y} r={DOT_RADIUS} fill={dotColor} />
    );

    // Branch labels
    for (let bi = 0; bi < node.branchLabels.length; bi++) {
      const label = node.branchLabels[bi];
      const lx = cx + 8;
      const ly = y - 8 - bi * 14;
      lines.push(
        <g key={`ref-${node.commit.oid}-${label.name}`}>
          <rect
            x={lx - 3}
            y={ly - 8}
            width={label.name.length * 7 + 10}
            height={14}
            rx={4}
            fill={label.isCurrent ? "var(--accent-color, #007acc)" : "var(--graph-branch-bg, #e8f5e9)"}
          />
          <text
            x={lx + 2}
            y={ly + 2}
            fontSize={9}
            fill={label.isCurrent ? "#fff" : "var(--graph-branch-text, #2e7d32)"}
            fontFamily="monospace"
          >
            {label.name}
          </text>
        </g>
      );
    }
  }

  return (
    <svg
      className={styles.graphSvg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      {lines}
    </svg>
  );
}

// ── Commit row ────────────────────────────────────────────────────

function CommitRow({
  node,
  rowIndex,
  offsetLeft,
  isSelected,
  isHead,
  onSelect,
  onCopyHash,
}: {
  node: GraphNode;
  rowIndex: number;
  offsetLeft: number;
  isSelected: boolean;
  isHead: boolean;
  onSelect: (c: GitCommitInfo) => void;
  onCopyHash: (hash: string) => void;
}) {
  const tooltip = `${node.commit.shortOid}  ${formatTime(node.commit.committedAt)}
${node.commit.message}${isHead ? `  [HEAD]` : ""}`;

  return (
    <div
      className={isSelected ? styles.treeRowSelected : isHead ? styles.treeRowHead : styles.treeRow}
      style={{
        position: "absolute",
        top: rowIndex * ROW_HEIGHT,
        left: offsetLeft,
        right: 0,
        height: ROW_HEIGHT,
      }}
      onClick={() => onSelect(node.commit)}
    >
      <div className={styles.treeInfo}>
        <div className={styles.treeMessage} data-tooltip={tooltip}>
          {node.commit.message}
          {isHead && <span className={styles.headBadge} title="HEAD">HEAD</span>}
        </div>
      </div>
      <div className={styles.treeActions}>
        <button
          className={styles.iconBtn}
          title="Copy hash"
          onClick={(e) => { e.stopPropagation(); onCopyHash(node.commit.oid); }}
        >
          📋
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export default function GitTab() {
  const t = useT();
  const current = usePackageStore((s) => s.current);
  const projectDir = current?.dir ?? "";

  const {
    loading, error,
    commits, branchRefs, branches, currentBranch, statusEntries,
    tasks,
    refresh, switchBranch,
    loadTasks,
    clearError,
  } = useGitStore();

  const [diffEntries, setDiffEntries] = useState<GitDiffEntry[]>([]);
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedOid, setSelectedOid] = useState<string | null>(null);

  // ── 计算图布局 ───────────────────────────────────────────────
  const graphNodes = useMemo(
    () => computeGraphLayout(commits, branchRefs),
    [commits, branchRefs]
  );

  const totalLanes = useMemo(() => {
    if (graphNodes.length === 0) return 1;
    return Math.max(...graphNodes.map((n) => n.lane)) + 1;
  }, [graphNodes]);

  // HEAD commit OID (tip of current branch)
  const headOid = useMemo(
    () => branchRefs.find((r) => r.isCurrent)?.tipOid ?? null,
    [branchRefs],
  );

  // Branches that contain the selected commit (by walking parent chain from each branch tip)
  const selectedBranchNames = useMemo(() => {
    if (!selectedOid) return new Set<string>();
    const result = new Set<string>();
    for (const br of branchRefs) {
      const visited = new Set<string>();
      const stack = [br.tipOid];
      while (stack.length > 0) {
        const oid = stack.pop()!;
        if (visited.has(oid)) continue;
        visited.add(oid);
        if (oid === selectedOid) { result.add(br.name); break; }
        const c = commits.find((x) => x.oid === oid);
        if (c) for (const p of c.parentOids) stack.push(p);
      }
    }
    return result;
  }, [selectedOid, branchRefs, commits]);

  const graphWidth = totalLanes * LANE_WIDTH + GRAPH_PAD_LEFT * 2;
  const treeHeight = graphNodes.length * ROW_HEIGHT;

  // ── 自动初始化 + 刷新 ──────────────────────────────────────
  useEffect(() => {
    if (!projectDir) return;
    const autoInit = async () => {
      try { await window.devtool.git.init(projectDir); } catch { /* 已存在则忽略 */ }
      refresh(projectDir);
      loadTasks(projectDir);
    };
    autoInit();
  }, [projectDir, refresh, loadTasks]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    if (!projectDir) return;
    refresh(projectDir);
    loadTasks(projectDir);
  }, [projectDir, refresh, loadTasks]);

  const handleSwitchBranch = useCallback((name: string) => {
    if (!projectDir) return;
    switchBranch(projectDir, name);
  }, [projectDir, switchBranch]);

  const handleCopyHash = useCallback(async (hash: string) => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const handleSelectCommit = useCallback(async (commit: GitCommitInfo) => {
    setSelectedOid(commit.oid);
    try {
      const parentOid = commit.parentOids[0];
      const entries = await window.devtool.git.diff(projectDir, parentOid, commit.oid);
      setDiffEntries(entries);
      setShowDiff(true);
    } catch {
      setDiffEntries([]);
    }
  }, [projectDir]);

  // ── 未加载项目 ──────────────────────────────────────────────
  if (!current) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📂</div>
          <div>{t("db.openFirst")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <button className={styles.btn} onClick={handleRefresh} disabled={loading} title={t("git.refresh")}>
          🔄
        </button>
        <span className={styles.spacer} />
        {copied && <span style={{ fontSize: 11, color: "#4caf50" }}>{t("git.copied")}</span>}
      </div>

      {/* ── Error ────────────────────────────────────────────── */}
      {error && (
        <div className={styles.error} onClick={clearError}>
          {error} ✕
        </div>
      )}

      {/* ── 分支列表（只读切换） ────────────────────────────── */}
      <div className={styles.branches}>
        <span className={styles.branchLabel}>{t("git.branches")}:</span>
        {branches.map((b) => {
          const isRelated = selectedOid !== null && selectedBranchNames.has(b.name);
          return (
            <button
              key={b.name}
              className={
                b.isCurrent ? styles.branchChipActive :
                isRelated ? styles.branchChipRelated :
                styles.branchChip
              }
              onClick={() => !b.isCurrent && handleSwitchBranch(b.name)}
              disabled={loading || b.isCurrent}
            >
              {b.name}
            </button>
          );
        })}
      </div>

      {/* ── 工作区状态（只读） ──────────────────────────────── */}
      {statusEntries.length > 0 && (
        <div className={styles.statusBar}>
          <strong>{t("git.changes")}:</strong> {statusEntries.length}
          {statusEntries.slice(0, 10).map((s) => (
            <div key={s.path} className={styles.statusFile}>
              <span className={`${styles.statusTag} ${STATUS_TAG_CLASS[s.status] || ""}`}>
                {t(`git.file${s.status.charAt(0).toUpperCase() + s.status.slice(1)}` as any) || s.status}
              </span>
              <span>{s.path}</span>
            </div>
          ))}
          {statusEntries.length > 10 && (
            <div style={{ fontSize: 10, color: "#aaa" }}>... +{statusEntries.length - 10} more</div>
          )}
        </div>
      )}

      {/* ── Diff 面板 ───────────────────────────────────────── */}
      {showDiff && diffEntries.length > 0 && (
        <div className={styles.diffPanel}>
          <div className={styles.diffHeader}>
            <span>{t("git.changedFiles")} ({diffEntries.length})</span>
            <button className={styles.iconBtn} onClick={() => { setShowDiff(false); setSelectedOid(null); }}>
              ✕
            </button>
          </div>
          {diffEntries.map((d) => (
            <div key={d.path} className={styles.diffFile}>
              <span className={`${styles.statusTag} ${STATUS_TAG_CLASS[d.changeType] || ""}`}>
                {d.changeType}
              </span>
              <span>{d.path}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 版本树 ──────────────────────────────────────────── */}
      <div className={styles.treeContainer}>
        {graphNodes.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📝</div>
            <div>{t("git.noHistory")}</div>
          </div>
        ) : (
          <div className={styles.treeScroll} style={{ height: treeHeight + 8 }}>
            <GraphSvg nodes={graphNodes} totalLanes={totalLanes} />
            <div style={{ position: "relative", width: "100%", height: treeHeight }}>
              {graphNodes.map((node, i) => (
                <CommitRow
                  key={node.commit.oid}
                  node={node}
                  rowIndex={i}
                  offsetLeft={graphWidth}
                  isSelected={selectedOid === node.commit.oid}
                  isHead={node.commit.oid === headOid}
                  onSelect={handleSelectCommit}
                  onCopyHash={handleCopyHash}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Checkpoint tasks ──────────────────────────────────── */}
      {tasks.length > 0 && (
        <div className={styles.checkpointPanel}>
          <div className={styles.checkpointHeader}>
            <span>{t("checkpoint.title")} ({tasks.length})</span>
            <button className={styles.iconBtn} onClick={handleRefresh} title={t("checkpoint.refresh")}>
              🔄
            </button>
          </div>
          {tasks.map((task) => (
            <div key={task.id} className={styles.taskItem}>
              <div className={styles.taskTitle}>
                <span className={`${styles.taskStatus} ${
                  task.status === "running" ? styles.statusRunning :
                  task.status === "completed" ? styles.statusCompleted :
                  styles.statusError
                }`} />
                {task.title || task.id.slice(0, 8)}
              </div>
              <div className={styles.taskMeta}>
                {t(`checkpoint.task${task.status.charAt(0).toUpperCase() + task.status.slice(1)}` as any)} ·{" "}
                {task.checkpoints.length} {t("checkpoint.checkpoints")}
              </div>
              {task.checkpoints.map((cp) => (
                <div key={cp.id} className={styles.checkpointItem}>
                  <span className={styles.treeHash}>{cp.commit_oid.slice(0, 7)}</span>
                  <span>{cp.summary}</span>
                  <span style={{ marginLeft: "auto", color: "#aaa" }}>
                    {cp.file_count} {t("checkpoint.files")}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
