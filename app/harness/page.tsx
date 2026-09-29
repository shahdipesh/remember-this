"use client";

import { useCallback, useEffect, useState } from "react";

type Msg = {
  id: number;
  role: string;
  text: string;
  created_at: string;
};

function fmtTs(iso: string) {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function HarnessPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [auto, setAuto] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/history");
      if (r.ok) setMessages(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [auto, load]);

  return (
    <div className="harness-wrap">
      <h1>Chat history harness</h1>
      <div className="harness-bar">
        <button onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Auto-refresh every 5s
        </label>
        <span className="harness-count">{messages.length} messages</span>
      </div>
      <table className="harness-table">
        <thead>
          <tr>
            <th>id</th>
            <th>role</th>
            <th>timestamp</th>
            <th>text</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.id}>
              <td>{m.id}</td>
              <td className={m.role === "user" ? "role-user" : "role-assistant"}>
                {m.role}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>{fmtTs(m.created_at)}</td>
              <td className="text">{m.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
