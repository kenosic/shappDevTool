/**
 * LeftPanel — 最左侧面板，包含"项目"和"分支"两个标签页。
 * "项目" tab 直接渲染原有的 Sidebar 组件，不重复信息。
 * "分支" tab 展示 Git 分支图，包含每个分支的提交节点链。
 */

import React, { useState, useCallback, useEffect } from "react";
import { usePackageStore } from "../../stores/packageStore";
import { useGitStore, type BranchGraphNode } from "../../stores/gitStore";
import Sidebar from "../Sidebar/Sidebar";
import ExtensionsTab from "../tabs/ExtensionsTab";
import { useT } from "../../i18n";
import styles from "./LeftPanel.module.css";

type LeftTab = "project" | "branches" | "extensions";

// ── SVG 图标 ──────────────────────────────────────────────────────

function ProjectIcon() {
  return (
    <svg viewBox="0 0 1024 1024" width="20" height="20" fill="currentColor">
      <path d="M808.1 142.3h-99.9v-37c0-4.1-3.3-7.4-7.4-7.4H649c-4.1 0-7.4 3.3-7.4 7.4v37H501v-37c0-4.1-3.3-7.4-7.4-7.4h-51.8c-4.1 0-7.4 3.3-7.4 7.4v37h-99.9c-16.4 0-29.6 13.2-29.6 29.6v111h-88.8c-16.4 0-29.6 13.2-29.6 29.6v584.6c0 16.4 13.2 29.6 29.6 29.6h473.6c16.4 0 29.6-13.2 29.6-29.6v-88.8h88.8c16.4 0 29.6-13.2 29.6-29.6V171.9c0-16.3-13.2-29.6-29.6-29.6zM652.7 860.1H253.1V349.5h201.6v160.9c0 20.4 16.6 37 37 37h160.9v312.7z m0-371.8H513.9V349.5h0.2l138.6 138.6v0.2z m118.4 253.4h-51.8V460.5L541.7 282.9H371.5v-74h62.9v29.6c0 4.1 3.3 7.4 7.4 7.4h51.8c4.1 0 7.4-3.3 7.4-7.4v-29.6h140.6v29.6c0 4.1 3.3 7.4 7.4 7.4h51.8c4.1 0 7.4-3.3 7.4-7.4v-29.6h62.9v532.8z" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 1024 1024" width="20" height="20" fill="currentColor">
      <path d="M303.146667 648.96A128.042667 128.042667 0 1 1 213.333333 647.253333V376.746667a128.042667 128.042667 0 1 1 85.333334 0V512c35.669333-26.794667 79.957333-42.666667 128-42.666667h170.666666a128.042667 128.042667 0 0 0 123.52-94.293333 128.042667 128.042667 0 1 1 86.698667 2.730667A213.418667 213.418667 0 0 1 597.333333 554.666667h-170.666666a128.042667 128.042667 0 0 0-123.52 94.293333zM256 725.333333a42.666667 42.666667 0 1 0 0 85.333334 42.666667 42.666667 0 0 0 0-85.333334zM256 213.333333a42.666667 42.666667 0 1 0 0 85.333334 42.666667 42.666667 0 0 0 0-85.333334z m512 0a42.666667 42.666667 0 1 0 0 85.333334 42.666667 42.666667 0 0 0 0-85.333334z" />
    </svg>
  );
}

function ExtensionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.611a2.404 2.404 0 0 1-1.705.706 2.404 2.404 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.931a2.5 2.5 0 1 1-1.974-3.561 2.5 2.5 0 0 1 4.859-.597c.18.427.182.904-.02 1.33-.205.435-.549.75-.98.928a2.5 2.5 0 1 0 1.386 4.808 2.5 2.5 0 0 0-.01-4.83c.434-.18.879-.188 1.33-.02.427.18.752.549.928.98a2.5 2.5 0 1 0 4.808-1.386 2.5 2.5 0 0 0-4.829.01c.188.434.188.879-.02 1.33-.18.427-.549.752-.98.928a2.5 2.5 0 1 0-1.386-4.808 2.5 2.5 0 0 0 .01 4.829c.435.18.88.188 1.33-.02.427-.18.75-.549.928-.98a2.5 2.5 0 1 0-4.808 1.386 2.5 2.5 0 0 0 4.829-.01z"/>
    </svg>
  );
}

export default function LeftPanel({ width = 290 }: { width?: number }) {
  const t = useT();
  const [tab, setTab] = useState<LeftTab>("project");
  const pkg = usePackageStore((s) => s.current);
  const { branches, currentBranch, switchBranch, fullRefresh, loading, graphNodes, selectedOid, restoreNode } = useGitStore();

  // ── 项目切换时全量刷新分支列表 ──────────────────────────
  useEffect(() => {
    if (pkg?.dir) {
      fullRefresh(pkg.dir);
    }
  }, [pkg?.dir, fullRefresh]);

  const handleSwitchBranch = useCallback(
    (name: string) => {
      if (!pkg) return;
      switchBranch(pkg.dir, name);
    },
    [pkg, switchBranch]
  );

  const handleRestoreNode = useCallback(
    (oid: string) => {
      if (!pkg) return;
      restoreNode(pkg.dir, oid);
    },
    [pkg, restoreNode]
  );

  return (
    <div className={styles.panel} style={{ width }}>
      {/* ── Vertical tab bar (VS Code style) ────────────────── */}
      <div className={styles.tabBar}>
        <button
          className={tab === "project" ? styles.tabActive : styles.tab}
          onClick={() => setTab("project")}
          title={t("leftPanel.projectDesc")}
        >
          <ProjectIcon />
        </button>
        <button
          className={tab === "branches" ? styles.tabActive : styles.tab}
          onClick={() => setTab("branches")}
          title={t("leftPanel.branchesDesc")}
        >
          <BranchIcon />
        </button>
        <button
          className={tab === "extensions" ? styles.tabActive : styles.tab}
          onClick={() => setTab("extensions")}
          title={t("leftPanel.extensionsDesc")}
        >
          <ExtensionIcon />
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className={styles.content}>
        {tab === "project" ? (
          <Sidebar />
        ) : tab === "extensions" ? (
          <ExtensionsTab />
        ) : (
          <BranchInfo
            branches={branches}
            currentBranch={currentBranch}
            loading={loading}
            graphNodes={graphNodes}
            selectedOid={selectedOid}
            onSwitchBranch={handleSwitchBranch}
            onRestoreNode={handleRestoreNode}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

// ── Branch info with graph nodes ──────────────────────────────────

function BranchInfo({
  branches,
  currentBranch,
  loading,
  graphNodes,
  selectedOid,
  onSwitchBranch,
  onRestoreNode,
  t,
}: {
  branches: { name: string; isCurrent: boolean; tipOid: string }[];
  currentBranch: string;
  loading: boolean;
  graphNodes: BranchGraphNode[];
  selectedOid: string | null;
  onSwitchBranch: (name: string) => void;
  onRestoreNode: (oid: string) => void;
  t: (key: string) => string;
}) {
  if (branches.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🔀</div>
        <div>{t("leftPanel.noBranches")}</div>
      </div>
    );
  }

  // Filter out "main" branch — it's the default base, not user-facing
  const visibleBranches = branches.filter((b) => b.name !== "main");

  // HEAD commit OID (tip of current branch)
  const headOid = branches.find((b) => b.isCurrent)?.tipOid ?? null;

  if (visibleBranches.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🔀</div>
        <div>{t("leftPanel.noBranches")}</div>
      </div>
    );
  }

  // Group nodes by branch
  const branchNodeMap = new Map<string, BranchGraphNode[]>();
  for (const br of visibleBranches) {
    const nodes = graphNodes.filter((n) =>
      n.branches.some((b) => b.name === br.name)
    );
    branchNodeMap.set(br.name, nodes);
  }

  return (
    <div className={styles.branchGraphWrap}>
      <div className={styles.branchGraphList}>
        {visibleBranches.map((br) => {
          const nodes = branchNodeMap.get(br.name) ?? [];
          return (
            <BranchGraphRow
              key={br.name}
              branch={br}
              nodes={nodes}
              isCurrent={br.isCurrent}
              headOid={headOid}
              selectedOid={selectedOid}
              onSwitchBranch={onSwitchBranch}
              onRestoreNode={onRestoreNode}
              t={t}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Single branch row with its commit node chain ──────────────────

function BranchGraphRow({
  branch,
  nodes,
  isCurrent,
  headOid,
  selectedOid,
  onSwitchBranch,
  onRestoreNode,
  t,
}: {
  branch: { name: string; isCurrent: boolean; tipOid: string };
  nodes: BranchGraphNode[];
  isCurrent: boolean;
  headOid: string | null;
  selectedOid: string | null;
  onSwitchBranch: (name: string) => void;
  onRestoreNode: (oid: string) => void;
  t: (key: string) => string;
}) {
  // Whether the selected commit belongs to this branch
  const containsSelected = selectedOid !== null && nodes.some((n) => n.oid === selectedOid);

  const rowClass = isCurrent ? styles.graphRowActive :
    containsSelected ? styles.graphRowRelated :
    styles.graphRow;

  return (
    <div className={rowClass}>
      {/* ── Branch header ── */}
      <div
        className={styles.graphBranchHeader}
        onClick={() => !branch.isCurrent && onSwitchBranch(branch.name)}
        title={branch.isCurrent ? t("git.currentBranch") : `${t("git.switchBranch")}: ${branch.name}`}
      >
        <span className={isCurrent ? styles.graphBranchDotActive : containsSelected ? styles.graphBranchDotRelated : styles.graphBranchDot} />
        <span className={styles.graphBranchName}>{branch.name}</span>
        {isCurrent && <span className={styles.graphCurrentBadge}>{t("git.currentBranch")}</span>}
      </div>

      {/* ── Node chain ── */}
      <div className={styles.graphNodeChain}>
        {nodes.length === 0 ? (
          <div className={styles.graphNodeEmpty}>{t("git.noHistory")}</div>
        ) : (
          nodes.map((node, i) => (
            <GraphNode
              key={node.oid}
              node={node}
              isFirst={i === 0}
              isLast={i === nodes.length - 1}
              isHead={node.oid === headOid}
              isSelected={node.oid === selectedOid}
              onSelect={() => onRestoreNode(node.oid)}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Single commit node ────────────────────────────────────────────

function GraphNode({
  node,
  isFirst,
  isLast,
  isHead,
  isSelected,
  onSelect,
  t,
}: {
  node: BranchGraphNode;
  isFirst: boolean;
  isLast: boolean;
  isHead: boolean;
  isSelected: boolean;
  onSelect: () => void;
  t: (key: string) => string;
}) {
  const timeStr = new Date(node.committedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const tooltip = `${node.shortOid}  ${timeStr}${isHead ? `  [${t("git.head")}]` : ""}
${node.message}`;

  const contentClass = [
    styles.graphNodeContent,
    isSelected ? styles.graphNodeContentSelected : "",
    isHead ? styles.graphNodeContentHead : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={styles.graphNode} onClick={onSelect}>
      {/* Connector line */}
      <div className={styles.graphNodeConnector}>
        <div className={styles.graphNodeLine} />
        <div className={isHead ? styles.graphNodeDotHead : isFirst ? styles.graphNodeDotTip : styles.graphNodeDot} />
      </div>

      {/* Node content */}
      <div className={contentClass} data-tooltip={tooltip}>
        <div className={styles.graphNodeMsg}>
          {isHead && <span className={styles.graphNodeHeadBadge}>{t("git.head")}</span>}
          {node.checkpoint ? (
            <span className={styles.graphNodeCheckpoint} title={t("checkpoint.title")}>
              🤖 {node.message.slice(0, 60)}{node.message.length > 60 ? "…" : ""}
            </span>
          ) : (
            <span>{node.message.slice(0, 60)}{node.message.length > 60 ? "…" : ""}</span>
          )}
        </div>
        {node.checkpoint && (
          <div className={styles.graphNodeMeta}>
            <span className={styles.graphNodeFileCount}>
              📄 {node.checkpoint.fileCount} {t("checkpoint.files")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

