import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.POSTGRES_URL!, { fullResults: true });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || secret !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = await getDb();
  const r = await q`SELECT id, role, text, created_at FROM messages ORDER BY id ASC`;
  const rows = (r as { rows: unknown[] }).rows;
  return Response.json({ v: "getdb-test", count: rows.length, rows });
}
