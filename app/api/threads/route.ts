import { NextRequest } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Thread list, most recently active first. */
export async function GET() {
  await ensureSchema();
  const sql = await getDb();
  const { rows } =
    await sql`SELECT t.id, t.title, t.created_at, MAX(m.created_at) AS last_active, COUNT(m.id) AS msg_count FROM threads t LEFT JOIN messages m ON m.thread_id = t.id GROUP BY t.id ORDER BY COALESCE(MAX(m.created_at), t.created_at) DESC`;
  return Response.json(rows);
}

/** Create a new thread. */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const sql = await getDb();
  let title = "New chat";
  try {
    const body = await req.json();
    if (typeof body?.title === "string" && body.title.trim()) {
      title = body.title.trim().slice(0, 80);
    }
  } catch {
    // no body — use default title
  }
  const { rows } = await sql`INSERT INTO threads (title) VALUES (${title}) RETURNING id, title, created_at`;
  return Response.json(rows[0]);
}

/** Delete a thread and its messages. */
export async function DELETE(req: NextRequest) {
  await ensureSchema();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const sql = await getDb();
  await sql`DELETE FROM messages WHERE thread_id = ${id}`;
  await sql`DELETE FROM threads WHERE id = ${id}`;
  return Response.json({ ok: true });
}
