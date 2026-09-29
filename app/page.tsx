"use client";

import { useEffect, useState } from "react";
import { AiChat, useAsStreamAdapter, type ChatItem } from "@nlux/react";
import "@nlux/themes/nova.css";
import "./design-system.css";

type Msg = {
  id: number;
  role: string;
  text: string;
  created_at: string;
};

// Coral sparkle avatar for the assistant persona.
const AVATAR_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23d97757' d='M12 2c.7 4.8 2.9 7 7.7 7.7-4.8.7-7 2.9-7.7 7.7-.7-4.8-2.9-7-7.7-7.7 4.8-.7 7-2.9 7.7-7.7z'/%3E%3C/svg%3E";

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
    <div className="rm-shell">
      <div className="rm-header">
        <strong>Remember</strong>
        <a href="/harness">harness</a>
      </div>
      <div className="rm-chat">
        {initial === null ? (
          <div className="rm-loading">Loading…</div>
        ) : (
          <AiChat
            adapter={adapter}
            initialConversation={initial}
            displayOptions={{ colorScheme: "light" }}
            personaOptions={{
              assistant: {
                name: "Remember",
                tagline: "Tell me anything — I'll keep it in mind.",
                avatar: AVATAR_URI,
              },
            }}
            composerOptions={{ placeholder: "Message Remember…" }}
            conversationOptions={{
              historyPayloadSize: "max",
              conversationStarters: [
                {
                  prompt: "Remember that my favorite food is pizza.",
                  label: "Remember a fact",
                },
                {
                  prompt: "What do you remember about me?",
                  label: "Recall memories",
                },
              ],
            }}
          />
        )}
      </div>
    </div>
  );
}
