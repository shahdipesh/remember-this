import { NextRequest } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { buildMessages, getModel, type HistoryItem } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_KEY_MSG =
  "No LLM API key is configured. Set GEMINI_API_KEY or GROQ_API_KEY in the Vercel project environment variables.";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message =
    typeof (body as { message?: unknown })?.message === "string"
      ? (body as { message: string }).message.trim()
      : "";
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }
  let threadId = Number((body as { thread_id?: unknown })?.thread_id);

  await ensureSchema();
  const sql = await getDb();

  // Resolve the thread: reuse the given one, or start a new thread.
  if (!threadId) {
    const r = await sql`INSERT INTO threads (title) VALUES ('New chat') RETURNING id`;
    threadId = Number(r.rows[0].id);
  } else {
    const r = await sql`SELECT id, title FROM threads WHERE id = ${threadId}`;
    if (r.rows.length === 0) {
      const c = await sql`INSERT INTO threads (title) VALUES ('New chat') RETURNING id`;
      threadId = Number(c.rows[0].id);
    } else if (String(r.rows[0].title) === "New chat") {
      // Name the thread after its first message.
      const title = message.length > 42 ? message.slice(0, 42) + "…" : message;
      await sql`UPDATE threads SET title = ${title} WHERE id = ${threadId}`;
    }
  }

  await sql`INSERT INTO messages (role, text, thread_id) VALUES ('user', ${message}, ${threadId})`;

  // Full prior history for this thread (exclude the message just inserted).
  // The requirement is the complete conversation as LLM context.
  // NOTE: SQL must not start with whitespace/newline (Neon HTTP API quirk).
  const { rows } = await sql`SELECT role, text FROM messages WHERE thread_id = ${threadId} ORDER BY id ASC`;
  const history: HistoryItem[] = rows
    .slice(0, -1) // exclude the message just inserted
    .map((r) => ({ role: String(r.role), text: String(r.text) }));

  const model = getModel();
  const encoder = new TextEncoder();
  const frame = (obj: object) =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      // Tell the client which thread this reply belongs to.
      controller.enqueue(frame({ thread_id: threadId }));
      if (!model) {
        controller.enqueue(frame({ token: NO_KEY_MSG }));
        await sql`INSERT INTO messages (role, text, thread_id) VALUES ('assistant', ${NO_KEY_MSG}, ${threadId})`;
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }
      try {
        let full = "";
        for await (const chunk of await model.stream(
          buildMessages(history, message)
        )) {
          const token =
            typeof chunk.content === "string" ? chunk.content : "";
          if (token) {
            full += token;
            controller.enqueue(frame({ token }));
          }
        }
        if (!full) full = "(empty reply)";
        await sql`INSERT INTO messages (role, text, thread_id) VALUES ('assistant', ${full}, ${threadId})`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(frame({ error: `LLM error: ${msg}` }));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
