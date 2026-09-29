import { NextRequest } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Full history for one thread (basic auth enforced by middleware). */
export async function GET(req: NextRequest) {
  await ensureSchema();
  const sql = await getDb();
  const threadId = Number(new URL(req.url).searchParams.get("thread_id"));
  if (!threadId) {
    return Response.json({ error: "thread_id is required" }, { status: 400 });
  }
  const { rows } =
    await sql`SELECT id, role, text, created_at FROM messages WHERE thread_id = ${threadId} ORDER BY id ASC`;
  return Response.json(rows);
}
