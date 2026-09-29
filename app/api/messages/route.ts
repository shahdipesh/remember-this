import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** Fresh neon() query function via dynamic import (verified pattern). */
async function getDb() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");
  const { neon } = await import("@neondatabase/serverless");
  return neon(url, { fullResults: true });
}

let ensured = false;
async function ensureSchema() {
  if (ensured) return;
  ensured = true;
  const sql = await getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

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
  const { rows } = await sql`
    SELECT id, role, text, created_at FROM messages ORDER BY id ASC
  `;
  return Response.json({ v: "inline-v1", count: rows.length, rows });
}
