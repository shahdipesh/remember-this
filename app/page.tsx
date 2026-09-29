"use client";

import { useEffect, useRef, useState } from "react";

type Msg = {
  id: number;
  role: string;
  text: string;
  created_at: string;
};

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Msg[]) => setMessages(rows))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    resetTa();
    setSending(true);

    const userMsg: Msg = {
      id: Date.now(),
      role: "user",
      text,
      created_at: new Date().toISOString(),
    };
    const asstId = Date.now() + 1;
    setMessages((m) => [
      ...m,
      userMsg,
      { id: asstId, role: "assistant", text: "", created_at: new Date().toISOString() },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      const patch = (t: string) =>
        setMessages((m) =>
          m.map((x) => (x.id === asstId ? { ...x, text: t } : x))
        );
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
            if (j.token) {
              acc += j.token;
              patch(acc);
            } else if (j.error) {
              patch(j.error);
              acc = j.error;
            }
          } catch {
            // ignore malformed frame
          }
        }
      }
      if (!acc) patch("(no response)");
    } catch {
      setMessages((m) =>
        m.map((x) =>
          x.id === asstId ? { ...x, text: "Request failed. Try again." } : x
        )
      );
    } finally {
      setSending(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // auto-grow like Claude's composer
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  }

  function resetTa() {
    const ta = taRef.current;
    if (ta) ta.style.height = "auto";
  }

  return (
    <div className="chat-wrap">
      <div className="chat-header">
        <h1>Remember</h1>
        <a href="/harness">harness</a>
      </div>
      <div className="chat-log">
        {messages.length === 0 && (
          <div className="chat-empty">
            <svg className="star" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 1.5l2.1 6.9 6.9 2.1-6.9 2.1L12 19.5l-2.1-6.9L3 10.5l6.9-2.1L12 1.5z" />
              <path d="M19 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
              <path d="M5 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
            </svg>
            <p>What should I remember?</p>
            <span>Tell me anything — I'll keep it in mind.</span>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${
              m.role === "user" ? "bubble-user" : "bubble-assistant"
            }`}
          >
            {m.text}
            <span className="meta">{fmtTime(m.created_at)}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <div className="input-pill">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={onInput}
            onKeyDown={onKey}
            placeholder="Message…"
            disabled={sending}
          />
          <button
            className="send-btn"
            onClick={send}
            disabled={sending || !input.trim()}
            aria-label="Send"
          >
            {sending ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M12 6v12" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M12 19V5m0 0l-6 6m6-6l6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
