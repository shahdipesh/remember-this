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

  return (
    <div className="chat-wrap">
      <div className="chat-header">
        <h1>Remember</h1>
        <a href="/harness">harness</a>
      </div>
      <div className="chat-log">
        {messages.length === 0 && (
          <div className="chat-empty">
            Say hi — or tell me something to remember.
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
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Message…"
          disabled={sending}
        />
        <button onClick={send} disabled={sending || !input.trim()}>
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
