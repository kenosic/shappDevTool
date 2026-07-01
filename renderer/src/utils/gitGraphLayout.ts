/**
 * Git commit graph layout algorithm.
 *
 * Assigns each commit to a "lane" (column) based on branch topology.
 * The current branch stays on lane 0 (leftmost).
 * Branch forks create new lanes. Merges merge lanes back together.
 */

import type { GitCommitInfo } from "../types/ipc";

// ── Types ─────────────────────────────────────────────────────────

export type GraphNode = {
  commit: GitCommitInfo;
  /** Column index (0 = current branch) */
  lane: number;
  /** Total lanes at this row */
  totalLanes: number;
  /** Parent connections: [parentOid, fromLane, toLane][] */
  parentLinks: Array<{ oid: string; fromLane: number; toLane: number }>;
  /** Branch refs pointing at this commit */
  branchLabels: Array<{ name: string; isCurrent: boolean }>;
};

// ── Layout ────────────────────────────────────────────────────────

/**
 * Compute a lane-based layout for a git commit DAG.
 *
 * Algorithm:
 * 1. Sort commits by time (newest first, already done by gitGraph)
 * 2. Walk commits newest→oldest, assign lanes:
 *    - The first parent inherits the current lane
 *    - Additional parents (merges) get new lanes above
 *    - When a branch forks (commit has children on multiple lanes), allocate new lanes
 * 3. The current branch is forced to lane 0
 */
export function computeGraphLayout(
  commits: GitCommitInfo[],
  branchRefs: Array<{ name: string; tipOid: string; isCurrent: boolean }>,
): GraphNode[] {
  if (commits.length === 0) return [];

  // Build lookup maps
  const oidToIndex = new Map<string, number>();
  commits.forEach((c, i) => oidToIndex.set(c.oid, i));

  const oidToBranchLabels = new Map<string, Array<{ name: string; isCurrent: boolean }>>();
  for (const ref of branchRefs) {
    const labels = oidToBranchLabels.get(ref.tipOid) ?? [];
    labels.push({ name: ref.name, isCurrent: ref.isCurrent });
    oidToBranchLabels.set(ref.tipOid, labels);
  }

  // Find the current branch tip (for lane 0 alignment)
  const currentBranchRef = branchRefs.find((r) => r.isCurrent);
  const currentTipOid = currentBranchRef?.tipOid;

  // Phase 1: Assign preliminary lanes (oldest→newest)
  //    Each commit gets a lane. Children inherit from parent.
  const laneMap = new Map<string, number>();
  const childrenMap = new Map<string, string[]>(); // parentOid → childOids[]

  // Build reverse edges (children)
  for (const c of commits) {
    for (const p of c.parentOids) {
      const children = childrenMap.get(p) ?? [];
      children.push(c.oid);
      childrenMap.set(p, children);
    }
  }

  // Walk oldest→newest, assign lanes greedily
  // Oldest commits are at the end of the array (sorted newest first)
  for (let i = commits.length - 1; i >= 0; i--) {
    const c = commits[i];
    if (laneMap.has(c.oid)) continue;

    if (c.parentOids.length === 0) {
      // Root commit — lane 0
      laneMap.set(c.oid, 0);
    } else if (c.parentOids.length === 1) {
      // Linear — inherit parent's lane
      const parentLane = laneMap.get(c.parentOids[0]) ?? 0;
      laneMap.set(c.oid, parentLane);
    } else {
      // Merge commit — use first parent's lane
      const parentLane = laneMap.get(c.parentOids[0]) ?? 0;
      laneMap.set(c.oid, parentLane);
    }
  }

  // Phase 2: Detect forks and allocate new lanes
  // When a commit has children on multiple lanes, its children need distinct lanes
  const usedLanes = new Set<number>();

  // Collect all lanes used
  for (const [, lane] of laneMap) {
    usedLanes.add(lane);
  }

  function allocateNewLane(): number {
    let lane = 0;
    while (usedLanes.has(lane)) lane++;
    usedLanes.add(lane);
    return lane;
  }

  // For each commit, check if its children need lane separation
  // We process newest→oldest
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const children = childrenMap.get(c.oid) ?? [];

    if (children.length > 1) {
      // This commit is a branch point — ensure children are on different lanes
      const childLanes = children.map((ch) => laneMap.get(ch) ?? 0);
      const uniqueLanes = new Set(childLanes);

      // If children share lanes, give some new lanes
      if (uniqueLanes.size < children.length) {
        const seen = new Set<number>();
        for (const ch of children) {
          const currentLane = laneMap.get(ch) ?? 0;
          if (seen.has(currentLane)) {
            // Conflict! Allocate a new lane
            const newLane = allocateNewLane();
            // Reassign this child and all its descendants to new lane
            reassignLane(ch, newLane, laneMap, childrenMap, commits, oidToIndex);
          } else {
            seen.add(currentLane);
          }
        }
      }
    }
  }

  // Phase 3: Force current branch tip to lane 0
  if (currentTipOid && laneMap.has(currentTipOid)) {
    const currentLane = laneMap.get(currentTipOid)!;
    if (currentLane !== 0) {
      // Swap: move current branch to lane 0, move lane 0 to currentLane
      swapLanes(currentTipOid, 0, currentLane, laneMap, childrenMap, commits, oidToIndex);
    }
  }

  // Phase 4: Build graph nodes in display order (newest first)
  const maxLane = usedLanes.size > 0 ? Math.max(...usedLanes) : 0;
  const totalLanes = maxLane + 1;

  const nodes: GraphNode[] = commits.map((c) => {
    const lane = laneMap.get(c.oid) ?? 0;
    const branchLabels = oidToBranchLabels.get(c.oid) ?? [];
    const parentLinks = c.parentOids.map((pOid) => ({
      oid: pOid,
      fromLane: lane,
      toLane: laneMap.get(pOid) ?? 0,
    }));

    return {
      commit: c,
      lane,
      totalLanes,
      parentLinks,
      branchLabels,
    };
  });

  return nodes;
}

// ── Helpers ───────────────────────────────────────────────────────

/** Reassign a commit and all its descendants to a new lane */
function reassignLane(
  oid: string,
  newLane: number,
  laneMap: Map<string, number>,
  childrenMap: Map<string, string[]>,
  commits: GitCommitInfo[],
  oidToIndex: Map<string, number>,
) {
  const stack = [oid];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    laneMap.set(current, newLane);

    const children = childrenMap.get(current) ?? [];
    for (const ch of children) {
      if (!visited.has(ch)) stack.push(ch);
    }
  }
}

/** Swap two lanes: all commits on laneA move to laneB, and vice versa */
function swapLanes(
  tipOid: string,
  laneA: number,
  laneB: number,
  laneMap: Map<string, number>,
  childrenMap: Map<string, string[]>,
  commits: GitCommitInfo[],
  oidToIndex: Map<string, number>,
) {
  // Find all commits on laneA (traverse from tipOid upward through parents)
  const onLaneA = new Set<string>();
  const stack = [tipOid];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const oid = stack.pop()!;
    if (visited.has(oid)) continue;
    visited.add(oid);

    const idx = oidToIndex.get(oid);
    if (idx === undefined) continue;

    // Follow parent chain while on the same lane
    const c = commits[idx];
    if (laneMap.get(oid) === laneA) {
      onLaneA.add(oid);
    }

    for (const p of c.parentOids) {
      if (!visited.has(p)) stack.push(p);
    }
  }

  // Swap
  for (const [oid, lane] of laneMap) {
    if (onLaneA.has(oid) && lane === laneA) {
      laneMap.set(oid, laneB);
    } else if (lane === laneB) {
      laneMap.set(oid, laneA);
    }
  }
}
