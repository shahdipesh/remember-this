import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.POSTGRES_URL!, { fullResults: true });
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

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || secret !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const q = await getDb();
  const { rows } = await q`
    SELECT id, role, text, created_at FROM messages ORDER BY id ASC
  `;
  return Response.json({ v: "destructure-test", count: (rows as unknown[]).length, rows });
}
