import { NextRequest } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Full message history for the memory-page inbox sweep.
 * Auth: ?secret=<CRON_SECRET> (separate from the UI basic-auth password).
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || secret !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const sql = await getDb();
  // TEMP: ?deleteAll=1 to clear table
  if (req.nextUrl.searchParams.get("deleteAll") === "1") {
    await sql`DELETE FROM messages WHERE id > 0`;
  }
  // NOTE: No leading whitespace in SQL (Neon HTTP API quirk).
  const { rows } = await sql`SELECT id, role, text, created_at FROM messages ORDER BY id ASC`;
  return Response.json(rows);
}
