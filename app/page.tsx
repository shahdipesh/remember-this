"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Msg = {
  id: number;
  role: string;
  text: string;
  created_at: string;
};

type ChatMsg = { role: "user" | "assistant"; text: string; streaming?: boolean };

const STARTERS = [
  { label: "Remember a fact", prompt: "Remember that my favorite food is pizza." },
  { label: "Recall memories", prompt: "What do you remember about me?" },
];

async function streamReply(prompt: string, onToken: (t: string) => void): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt }),
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
        const j = JSON.parse(data) as { token?: string; error?: string };
        if (j.token) onToken(j.token);
        else if (j.error) throw new Error(j.error);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("LLM error")) throw e;
        // ignore malformed frame
      }
    }
  }
}

export default function ChatPage() {
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Msg[]) =>
        setMsgs(
          rows.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            text: m.text,
          }))
        )
      )
      .catch(() => setMsgs([]));
  }, []);

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

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || sending) return;
    setSending(true);
    setInput("");
    setMsgs((prev) => [...(prev ?? []), { role: "user", text: prompt }]);
    // Placeholder the assistant reply so tokens stream into it.
    setMsgs((prev) => [...(prev ?? []), { role: "assistant", text: "", streaming: true }]);
    try {
      let acc = "";
      await streamReply(prompt, (t) => {
        acc += t;
        const snapshot = acc;
        setMsgs((prev) => {
          const next = [...(prev ?? [])];
          next[next.length - 1] = { role: "assistant", text: snapshot, streaming: true };
          return next;
        });
      });
      setMsgs((prev) => {
        const next = [...(prev ?? [])];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          role: "assistant",
          text: last.text || "(empty reply)",
        };
        return next;
      });
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
    <div className="chat-wrap">
      <header className="chat-header">
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
            disabled={!input.trim() || sending}
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
  );
}
