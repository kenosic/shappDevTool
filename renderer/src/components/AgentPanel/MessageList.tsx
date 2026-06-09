import React, { useEffect, useRef, useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useAgentStore, type DisplayMessage, type ContentPart, type QuestionInfo } from "../../stores/agentStore";
import { useT } from "../../i18n";
import styles from "./MessageList.module.css";

// Stable empty array — prevents "getSnapshot should be cached" infinite loop
const EMPTY_MESSAGES: DisplayMessage[] = [];

export default function MessageList() {
  const t = useT();
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const messages = useAgentStore((s) => {
    const id = s.activeSessionId;
    return id ? (s.messages[id] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES;
  });
  const initialized = useAgentStore((s) => s.initialized);

  const listRef = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" });
    userScrolled.current = false;
  }, []);

  // Auto-scroll on new messages unless user scrolled up
  useEffect(() => {
    if (!userScrolled.current) {
      scrollToBottom(false);
    }
  }, [messages.length, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolled.current = distFromBottom > 60;
  }, []);

  if (!initialized || !activeSessionId) {
    return (
      <div className={styles.empty}>
        <OpencodeLogo />
        <div className={styles.emptyText}>
          {t("agent.emptyNew")}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={styles.empty}>
        <OpencodeLogo />
        <div className={styles.emptyText}>
          {t("agent.emptySend")}
          <br />
          <span style={{ fontSize: 11 }}>{t("agent.emptyHint")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.list} ref={listRef} onScroll={handleScroll}>
      {mergeAssistantMessages(messages).map((msg) => (
        <MessageItem key={msg.id} msg={msg} />
      ))}
    </div>
  );
}

/**
 * Merge consecutive assistant messages that contain only tool parts (no text)
 * into the next assistant message that has text content.  This preserves the
 * original part order within each message while collecting tools from
 * multi-step responses into a single bubble.
 *
 * Tool-only tails (no following text message) are flushed as-is.
 */
function mergeAssistantMessages(messages: DisplayMessage[]): DisplayMessage[] {
  const result: DisplayMessage[] = [];
  let pendingParts: ContentPart[] = [];
  let pendingId = "";

  for (const msg of messages) {
    if (msg.role !== "assistant") {
      // Flush any accumulated parts before a non-assistant message
      if (pendingParts.length > 0) {
        result.push({ id: pendingId, role: "assistant", contentParts: pendingParts, isStreaming: false, createdAt: msg.createdAt });
        pendingParts = [];
        pendingId = "";
      }
      result.push(msg);
      continue;
    }

    pendingParts = [...pendingParts, ...msg.contentParts];
    if (!pendingId) pendingId = msg.id;

    const hasText = msg.contentParts.some((p) => p.kind === "text" && p.text.trim());
    if (hasText || msg.isStreaming) {
      // Emit one combined bubble with all accumulated parts in order
      result.push({ ...msg, contentParts: pendingParts });
      pendingParts = [];
      pendingId = "";
    }
    // else: tool-only message — keep accumulating
  }

  // Flush remaining parts (tool-only tail)
  if (pendingParts.length > 0) {
    result.push({ id: pendingId, role: "assistant", contentParts: pendingParts, isStreaming: false, createdAt: Date.now() });
  }

  return result;
}

const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  code({ node, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? "");
    const isBlock = (props as any).inline === false || Boolean(match);
    return isBlock ? (
      <SyntaxHighlighter
        style={vscDarkPlus as any}
        language={match ? match[1] : "text"}
        PreTag="div"
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

function MessageItem({ msg }: { msg: DisplayMessage }) {
  if (msg.role === "system") {
    const textPart = msg.contentParts.find((p) => p.kind === "text");
    return <div className={styles.systemMsg}>{(textPart as any)?.text ?? ""}</div>;
  }

  if (msg.role === "user") {
    const textPart = msg.contentParts.find((p) => p.kind === "text");
    return <div className={styles.userBubble}>{(textPart as any)?.text ?? ""}</div>;
  }

  // Assistant — render parts in the order they arrived from the SSE stream
  const hasText = msg.contentParts.some((p) => p.kind === "text" && (p as any).text?.trim());
  return (
    <div className={styles.assistantBubble}>
      {msg.contentParts.map((part, i) => {
        if (part.kind === "tool") {
          return part.toolName === "question"
            ? <QuestionCard key={part.callID || i} args={part.args} result={part.result} status={part.status} />
            : <ToolCallCard key={part.callID || i} toolName={part.toolName} args={part.args} result={part.result} status={part.status} />;
        }
        if (part.kind === "text") {
          return part.text
            ? <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents}>{part.text}</ReactMarkdown>
            : null;
        }
        return null;
      })}
      {msg.isStreaming && !hasText && <span className={styles.cursor} />}
    </div>
  );
}

function QuestionCard({
  args,
  result,
  status,
}: {
  args: Record<string, unknown>;
  result?: string;
  status: "pending" | "running" | "completed" | "error";
}) {
  const t = useT();
  const answerQuestion = useAgentStore((s) => s.answerQuestion);
  // A pending question is only "live" (submittable) while the control-poll
  // loop is actively waiting for an answer from the server.  Historical
  // questions loaded from a restored session have no live execution context
  // and must NOT be submitted (the server is no longer waiting).
  const pendingQuestion = useAgentStore((s) => s.pendingQuestion);
  const isLive = pendingQuestion !== null;
  const questions = (args.questions as QuestionInfo[] | undefined) ?? [];

  const [answers, setAnswers] = useState<string[][]>(() => questions.map(() => []));
  const [customTexts, setCustomTexts] = useState<string[]>(() => questions.map(() => ""));
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Sync answers/customTexts length when questions array grows (pending → running)
  useEffect(() => {
    setAnswers((prev) => questions.map((_, i) => prev[i] ?? []));
    setCustomTexts((prev) => questions.map((_, i) => prev[i] ?? ""));
  }, [questions.length]);

  const isDone = status === "completed" || status === "error";

  const toggleOption = (qIdx: number, label: string, multiple?: boolean) => {
    setAnswers((prev) => {
      const next = [...prev];
      const cur = next[qIdx] ?? [];
      if (multiple) {
        next[qIdx] = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label];
      } else {
        next[qIdx] = cur[0] === label ? [] : [label];
      }
      return next;
    });
  };

  const handleCustomChange = (qIdx: number, text: string) => {
    setCustomTexts((prev) => { const n = [...prev]; n[qIdx] = text; return n; });
    setAnswers((prev) => {
      const next = [...prev];
      // Remove any previous custom entry (not matching an option label)
      const optionLabels = new Set(questions[qIdx]?.options.map((o) => o.label) ?? []);
      const withoutCustom = (next[qIdx] ?? []).filter((l) => optionLabels.has(l));
      next[qIdx] = text.trim() ? [...withoutCustom, text.trim()] : withoutCustom;
      return next;
    });
  };

  const allAnswered = answers.every((a) => a.length > 0);

  const handleSubmit = async () => {
    console.log("[QuestionCard] handleSubmit, allAnswered =", allAnswered, "submitted =", submitted, "answers =", JSON.stringify(answers));
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    await answerQuestion(answers);
  };

  // Stale historical question — the OpenCode execution context no longer
  // exists (server restarted).  Show a locked, expandable summary.
  if (!isDone && !submitted && !isLive) {
    return (
      <div className={`${styles.questionCard} ${styles.questionCardStale}`}>
        <div
          className={styles.questionHeader}
          style={questions.length > 0 ? { cursor: "pointer" } : undefined}
          onClick={questions.length > 0 ? () => setExpanded((v) => !v) : undefined}
        >
          <QuestionIcon />
          <span className={styles.questionTitle}>{t("tool.question") ?? "问卷调查"}</span>
          <span className={styles.questionStateStale}>{t("tool.interrupted") ?? "已中断"}</span>
          {questions.length > 0 && <ChevronIcon open={expanded} />}
        </div>
        {expanded && questions.length > 0 && (
          <div className={styles.questionBody}>
            {questions.map((q, qIdx) => (
              <div key={qIdx} className={styles.questionItem}>
                {q.header && <div className={styles.questionItemHeader}>{q.header}</div>}
                <div className={styles.questionItemText}>{q.question}</div>
                {q.options.length > 0 && (
                  <div className={styles.questionOptions}>
                    {q.options.map((opt) => (
                      <div key={opt.label} className={`${styles.questionOption} ${styles.questionOptionDisabled}`}>
                        <span className={styles.questionOptionLabel}>{opt.label}</span>
                        {opt.description && (
                          <span className={styles.questionOptionDesc}>{opt.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isDone || submitted) {
    const canExpand = submitted
      ? questions.length > 0
      : Boolean(result);
    return (
      <div className={styles.questionCard}>
        <div
          className={styles.questionHeader}
          style={canExpand ? { cursor: "pointer" } : undefined}
          onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
        >
          <QuestionIcon />
          <span className={styles.questionTitle}>{t("tool.question") ?? "问卷调查"}</span>
          <span className={styles.questionStateDone}>{t("tool.completed") ?? "已完成"}</span>
          {canExpand && <ChevronIcon open={expanded} />}
        </div>
        {expanded && canExpand && (
          <div className={styles.questionBody}>
            {submitted && questions.length > 0 ? (
              questions.map((q, qIdx) => {
                const ans = (answers[qIdx] ?? []).filter(Boolean);
                return (
                  <div key={qIdx} className={styles.questionItem}>
                    {q.header && <div className={styles.questionItemHeader}>{q.header}</div>}
                    <div className={styles.questionItemText}>{q.question}</div>
                    <div className={styles.questionAnswerResult}>
                      {ans.length > 0 ? ans.join("、") : "—"}
                    </div>
                  </div>
                );
              })
            ) : result ? (
              <pre className={styles.toolArgs}>{result}</pre>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.questionCard}>
      <div className={styles.questionHeader}>
        <QuestionIcon />
        <span className={styles.questionTitle}>{t("tool.question") ?? "问卷调查"}</span>
        <span className={styles.questionStateRunning}>{t("tool.waitingInput") ?? "等待输入"}</span>
      </div>
      <div className={styles.questionBody}>
        {questions.map((q, qIdx) => (
          <div key={qIdx} className={styles.questionItem}>
            {q.header && <div className={styles.questionItemHeader}>{q.header}</div>}
            <div className={styles.questionItemText}>{q.question}</div>
            {q.options.length > 0 && (
              <div className={styles.questionOptions}>
                {q.options.map((opt) => {
                  const selected = answers[qIdx]?.includes(opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      className={`${styles.questionOption} ${selected ? styles.questionOptionSelected : ""}`}
                      onClick={() => toggleOption(qIdx, opt.label, q.multiple)}
                    >
                      <span className={styles.questionOptionLabel}>{opt.label}</span>
                      {opt.description && (
                        <span className={styles.questionOptionDesc}>{opt.description}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {q.custom !== false && (
              <div className={styles.questionCustom}>
                <input
                  type="text"
                  className={styles.questionCustomInput}
                  placeholder={t("tool.customAnswer") ?? "自定义输入…"}
                  value={customTexts[qIdx] ?? ""}
                  onChange={(e) => handleCustomChange(qIdx, e.target.value)}
                />
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          className={`${styles.questionSubmit} ${allAnswered ? styles.questionSubmitActive : ""}`}
          disabled={!allAnswered}
          onClick={handleSubmit}
        >
          {t("tool.submit") ?? "提交"}
        </button>
      </div>
    </div>
  );
}

function QuestionIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5 5a1.5 1.5 0 012.8.7c0 .8-.9 1.2-.9 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="6.5" cy="9.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function ToolCallCard({
  toolName,
  args,
  result,
  status,
}: {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  status: "pending" | "running" | "completed" | "error";
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const isDone = status === "completed" || status === "error";

  return (
    <div className={styles.toolCard}>
      <div className={styles.toolHeader} onClick={() => setOpen(!open)}>
        <ToolIcon />
        <span className={styles.toolName}>{toolName}</span>
        <span className={`${styles.toolState} ${isDone ? styles.toolStateDone : ""}`}>
          {status === "completed" ? t("tool.completed") : status === "error" ? t("tool.error") : t("tool.running")}
        </span>
        <ChevronIcon open={open} />
      </div>
      {open && (
        <div className={styles.toolBody}>
          <pre className={styles.toolArgs}>
            {JSON.stringify(args, null, 2)}
          </pre>
          {isDone && result !== undefined && (
            <>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "6px 0 2px" }}>{t("tool.returnValue")}</div>
              <pre className={styles.toolArgs}>{result}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ToolIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M8.5 1.5a3 3 0 00-3 4L2 9a1.41 1.41 0 002 2l3.5-3.5a3 3 0 004-3 3 3 0 00-.5-1.5L9.5 4.5 8.5 3.5l1.5-1.5A3 3 0 008.5 1.5z"
        stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
      <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpencodeLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="117" height="21" viewBox="0 0 234 42" fill="none" aria-label="OpenCode">
      <path d="M18 30H6V18H18V30Z" fill="#CFCECD"/>
      <path d="M18 12H6V30H18V12ZM24 36H0V6H24V36Z" fill="#656363"/>
      <path d="M48 30H36V18H48V30Z" fill="#CFCECD"/>
      <path d="M36 30H48V12H36V30ZM54 36H36V42H30V6H54V36Z" fill="#656363"/>
      <path d="M84 24V30H66V24H84Z" fill="#CFCECD"/>
      <path d="M84 24H66V30H84V36H60V6H84V24ZM66 18H78V12H66V18Z" fill="#656363"/>
      <path d="M108 36H96V18H108V36Z" fill="#CFCECD"/>
      <path d="M108 12H96V36H90V6H108V12ZM114 36H108V12H114V36Z" fill="#656363"/>
      <path d="M144 30H126V18H144V30Z" fill="#CFCECD"/>
      <path d="M144 12H126V30H144V36H120V6H144V12Z" fill="#211E1E"/>
      <path d="M168 30H156V18H168V30Z" fill="#CFCECD"/>
      <path d="M168 12H156V30H168V12ZM174 36H150V6H174V36Z" fill="#211E1E"/>
      <path d="M198 30H186V18H198V30Z" fill="#CFCECD"/>
      <path d="M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z" fill="#211E1E"/>
      <path d="M234 24V30H216V24H234Z" fill="#CFCECD"/>
      <path d="M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z" fill="#211E1E"/>
    </svg>
  );
}
