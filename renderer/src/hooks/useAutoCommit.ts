/**
 * Auto-commit hook: 每一次 Agent 对话完成后自动 git commit。
 * commit message 使用用户 query 文本（过长则尾部省略）。
 *
 * 工作流程：
 * 1. Agent session 创建 → 自动 git init + 创建 `task-{id}` 分支
 * 2. Agent 完成回复（session idle）→ agentStore 自动 commit + fullRefresh
 *    （见 agentStore._handleEvent 中的 session.idle 处理）
 * 3. 本 hook 作为二级兜底：监听 streaming 状态转换，
 *    在 agentStore 主路径失效时仍然触发 commit + refresh
 * 4. 每个 commit 同时写入 SQLite checkpoint 记录
 */

import { useEffect, useRef } from "react";
import { useAgentStore } from "../stores/agentStore";
import { useGitStore } from "../stores/gitStore";
import { usePackageStore } from "../stores/packageStore";

/** 已为之创建过分支的 session ID 集合（按 projectDir 隔离） */
const branchedSessionsByProject = new Map<string, Set<string>>();

/** 最近已触发过 auto-commit 的 session+时间窗（防重） */
const recentCommits = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000; // 5 秒内同一 session 不重复 commit

function getBranchedSessions(projectDir: string): Set<string> {
  let s = branchedSessionsByProject.get(projectDir);
  if (!s) {
    s = new Set<string>();
    branchedSessionsByProject.set(projectDir, s);
  }
  return s;
}

/** 截断文本：超过 maxLen 则尾部用 … 省略 */
function truncate(text: string, maxLen = 50): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

/**
 * 为指定 session 自动初始化仓库并创建专属分支。
 */
async function ensureSessionBranch(projectDir: string, sessionId: string) {
  const branchedSessions = getBranchedSessions(projectDir);
  if (branchedSessions.has(sessionId)) return;
  branchedSessions.add(sessionId);

  try {
    await window.devtool.git.init(projectDir);
    const branchName = `task-${sessionId.slice(0, 8)}`;
    const branches = await window.devtool.git.listBranches(projectDir);
    if (!branches.some((b) => b.name === branchName)) {
      await window.devtool.git.createBranch(projectDir, branchName);
    }
    // 刷新 git store，让新分支立即出现在 UI 中
    useGitStore.getState().fullRefresh(projectDir);
  } catch {
    // 静默忽略
  }
}

export function useAutoCommit() {
  const projectDir = usePackageStore((s) => s.current?.dir);

  // ── 监听 Agent session 变化 → 自动创建分支 ──────────────
  const sessions = useAgentStore((s) => s.sessions);

  useEffect(() => {
    if (!projectDir) return;
    for (const s of sessions) {
      ensureSessionBranch(projectDir, s.id);
    }
  }, [projectDir, sessions]);

  // ── 二级兜底：监听 streaming 状态转换 → auto-commit ──
  // agentStore._handleEvent(session.idle) 是主路径，这里做兜底。
  const prevStreamingRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!projectDir) return;

    const unsub = useAgentStore.subscribe((state) => {
      for (const [sessionId, msgs] of Object.entries(state.messages)) {
        const wasStreaming = prevStreamingRef.current[sessionId] ?? false;
        const isStreaming = msgs.some((m) => m.isStreaming);
        prevStreamingRef.current[sessionId] = isStreaming;

        // streaming 刚结束（true → false）
        if (wasStreaming && !isStreaming) {
          // 防重：5 秒内同一 session 不重复 commit
          const lastCommit = recentCommits.get(sessionId) ?? 0;
          if (Date.now() - lastCommit < DEDUP_WINDOW_MS) continue;
          recentCommits.set(sessionId, Date.now());

          // 找到该 session 最后一条用户消息作为 query
          const userMsgs = msgs.filter((m) => m.role === "user");
          const lastUser = userMsgs[userMsgs.length - 1];
          if (!lastUser) continue;

          const textPart = lastUser.contentParts.find((p) => p.kind === "text");
          if (!textPart) continue;

          const query = (textPart as { kind: "text"; text: string }).text;
          const summary = truncate(query);

          // 延迟等文件写入完成后 commit
          setTimeout(async () => {
            try {
              const result = await window.devtool.git.autoCommit(projectDir, sessionId, summary);
              if (result) {
                // fullRefresh 原子加载 git 数据 + checkpoint 任务
                useGitStore.getState().fullRefresh(projectDir);
              }
            } catch {
              // 静默忽略
            }
          }, 1500);
        }
      }
    });

    return () => { unsub(); };
  }, [projectDir]);

  // ── 定期清理过期缓存 ──────────────────────────────────────
  useEffect(() => {
    if (branchedSessionsByProject.size > 20) {
      const entries = [...branchedSessionsByProject.entries()];
      for (const [key] of entries.slice(0, entries.length - 10)) {
        branchedSessionsByProject.delete(key);
      }
    }
    // 清理超过 1 分钟的防重记录
    const now = Date.now();
    for (const [key, ts] of recentCommits) {
      if (now - ts > 60_000) recentCommits.delete(key);
    }
  }, [projectDir]);
}

