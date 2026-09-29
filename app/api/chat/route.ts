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

  await ensureSchema();
  const sql = await getDb();
  await sql`INSERT INTO messages (role, text) VALUES ('user', ${message})`;

  // Full prior history for context (exclude the message just inserted).
  // The requirement is the complete conversation as LLM context.
  const { rows } = await sql`
    SELECT role, text FROM messages ORDER BY id ASC
  `;
  const history: HistoryItem[] = rows
    .slice(0, -1) // exclude the message just inserted
    .map((r) => ({ role: String(r.role), text: String(r.text) }));

  const model = getModel();
  const encoder = new TextEncoder();
  const frame = (obj: object) =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      if (!model) {
        controller.enqueue(frame({ token: NO_KEY_MSG }));
        await sql`INSERT INTO messages (role, text) VALUES ('assistant', ${NO_KEY_MSG})`;
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
        await sql`INSERT INTO messages (role, text) VALUES ('assistant', ${full})`;
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
