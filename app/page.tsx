"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Msg = {
  id: number;
  role: string;
  text: string;
  created_at: string;
};

type Thread = {
  id: number;
  title: string;
  created_at: string;
  last_active: string | null;
  msg_count: string;
};

type ChatMsg = { role: "user" | "assistant"; text: string; streaming?: boolean };

const STARTERS = [
  { label: "Remember a fact", prompt: "Remember that my favorite food is pizza." },
  { label: "Recall memories", prompt: "What do you remember about me?" },
];

async function streamReply(
  prompt: string,
  threadId: number,
  onToken: (t: string) => void,
  onThreadId: (id: number) => void
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt, thread_id: threadId }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data) as {
          token?: string;
          error?: string;
          thread_id?: number;
        };
        if (typeof j.thread_id === "number") onThreadId(j.thread_id);
        else if (j.token) onToken(j.token);
        else if (j.error) throw new Error(j.error);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("LLM error")) throw e;
        // ignore malformed frame
      }
    }
  }
}

export default function ChatPage() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const refreshThreads = useCallback(async () => {
    const r = await fetch("/api/threads");
    if (r.ok) setThreads(await r.json());
  }, []);

  const loadThread = useCallback(async (id: number) => {
    setActiveId(id);
    setMsgs(null);
    setDrawerOpen(false);
    try {
      const r = await fetch(`/api/history?thread_id=${id}`);
      const rows: Msg[] = r.ok ? await r.json() : [];
      setMsgs(
        rows.map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          text: m.text,
        }))
      );
    } catch {
      setMsgs([]);
    }
  }, []);

  // Initial load: threads, then open the most recent one.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/threads");
        const list: Thread[] = r.ok ? await r.json() : [];
        setThreads(list);
        if (list.length > 0) await loadThread(Number(list[0].id));
        else setMsgs([]);
      } catch {
        setThreads([]);
        setMsgs([]);
      }
    })();
  }, [loadThread]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // Auto-grow the composer.
  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  }, [input]);

  async function newChat() {
    try {
      const r = await fetch("/api/threads", { method: "POST" });
      const t: Thread = await r.json();
      setThreads((prev) => [t, ...(prev ?? [])]);
      setActiveId(Number(t.id));
      setMsgs([]);
      setDrawerOpen(false);
      taRef.current?.focus();
    } catch {
      // ignore
    }
  }

  async function deleteThread(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;
    await fetch(`/api/threads?id=${id}`, { method: "DELETE" });
    setThreads((prev) => (prev ?? []).filter((t) => Number(t.id) !== id));
    if (Number(activeId) === id) {
      const rest = (threads ?? []).filter((t) => Number(t.id) !== id);
      if (rest.length > 0) await loadThread(Number(rest[0].id));
      else await newChat();
    }
  }

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || sending || activeId === null) return;
    const tid = activeId;
    setSending(true);
    setInput("");
    setMsgs((prev) => [...(prev ?? []), { role: "user", text: prompt }]);
    setMsgs((prev) => [...(prev ?? []), { role: "assistant", text: "", streaming: true }]);
    try {
      let acc = "";
      await streamReply(
        prompt,
        tid,
        (t) => {
          acc += t;
          const snapshot = acc;
          setMsgs((prev) => {
            const next = [...(prev ?? [])];
            next[next.length - 1] = { role: "assistant", text: snapshot, streaming: true };
            return next;
          });
        },
        () => {}
      );
      setMsgs((prev) => {
        const next = [...(prev ?? [])];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          role: "assistant",
          text: last.text || "(empty reply)",
        };
        return next;
      });
      // Pick up the auto-generated thread title.
      await refreshThreads();
    } catch {
      setMsgs((prev) => {
        const next = [...(prev ?? [])];
        next[next.length - 1] = {
          role: "assistant",
          text: "Sorry — something went wrong. Try again.",
        };
        return next;
      });
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="app">
      <div
        className={`drawer-scrim${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside className={`sidebar${drawerOpen ? " open" : ""}`}>
        <button className="new-chat" onClick={newChat}>
          <span className="plus">+</span> New chat
        </button>
        <nav className="thread-list">
          {(threads ?? []).map((t) => (
            <div
              key={t.id}
              className={`thread${Number(t.id) === activeId ? " active" : ""}`}
              onClick={() => loadThread(Number(t.id))}
              title={t.title}
            >
              <span className="thread-title">{t.title}</span>
              <button
                className="thread-del"
                onClick={(e) => deleteThread(Number(t.id), e)}
                aria-label="Delete chat"
              >
                ×
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">Remember</div>
      </aside>

      <div className="chat-wrap">
        <header className="chat-header">
          <button
            className="menu-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open chats"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <h1>Remember</h1>
          <a href="/harness">harness</a>
        </header>

        <div className="chat-log" ref={logRef}>
          {msgs === null ? (
            <div className="chat-loading">Loading…</div>
          ) : msgs.length === 0 ? (
            <div className="chat-empty">
              <svg className="star" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 2c.7 4.8 2.9 7 7.7 7.7-4.8.7-7 2.9-7.7 7.7-.7-4.8-2.9-7-7.7-7.7 4.8-.7 7-2.9 7.7-7.7z"
                />
              </svg>
              <p>What should I remember?</p>
              <span>Tell me anything — I&apos;ll keep it in mind.</span>
              <div className="starters">
                {STARTERS.map((s) => (
                  <button key={s.label} onClick={() => send(s.prompt)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="bubble-user">
                  {m.text}
                </div>
              ) : (
                <div key={i} className="bubble-assistant">
                  <div className="assistant-name">Remember</div>
                  <div className="md">
                    {m.text ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                    ) : (
                      <span className="typing">
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                  </div>
                </div>
              )
            )
          )}
        </div>

        <div className="chat-input">
          <div className="input-pill">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message Remember…"
              aria-label="Message Remember"
            />
            <button
              className="send-btn"
              onClick={() => send(input)}
              disabled={!input.trim() || sending || activeId === null}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 19V5m0 0l-6 6m6-6l6 6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
