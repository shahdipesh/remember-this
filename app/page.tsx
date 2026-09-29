"use client";

import { useEffect, useState } from "react";
import { AiChat, useAsStreamAdapter, type ChatItem } from "@nlux/react";
import "@nlux/themes/nova.css";

type Msg = {
  id: number;
  role: string;
  text: string;
  created_at: string;
};

export default function ChatPage() {
  const [initial, setInitial] = useState<ChatItem[] | null>(null);

  // Load full history so the chat restores on reload.
  useEffect(() => {
    fetch("/api/history")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Msg[]) =>
        setInitial(
          rows.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            message: m.text,
          }))
        )
      )
      .catch(() => setInitial([]));
  }, []);

  // Adapter: nlux -> our /api/chat SSE endpoint.
  // The backend persists messages and loads full history itself,
  // so we only send the latest prompt.
  const adapter = useAsStreamAdapter(async (prompt: string, observer) => {
    try {
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
            if (j.token) observer.next(j.token);
            else if (j.error) {
              observer.error(new Error(j.error));
              return;
            }
          } catch {
            // ignore malformed frame
          }
        }
      }
      observer.complete();
    } catch (e) {
      observer.error(e instanceof Error ? e : new Error("Request failed"));
    }
  });

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <strong style={{ fontSize: 15 }}>Remember</strong>
        <a
          href="/harness"
          style={{ fontSize: 13, color: "#8a8781", textDecoration: "none" }}
        >
          harness
        </a>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {initial === null ? (
          <div style={{ padding: 40, textAlign: "center", color: "#8a8781" }}>
            Loading…
          </div>
        ) : (
          <AiChat
            adapter={adapter}
            initialConversation={initial}
            displayOptions={{ colorScheme: "light" }}
            composerOptions={{ placeholder: "Message…" }}
            conversationOptions={{ historyPayloadSize: "max" }}
          />
        )}
      </div>
    </div>
  );
}
