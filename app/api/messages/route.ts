import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || secret !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { neon } = await import("@neondatabase/serverless");
  const q = neon(process.env.POSTGRES_URL!, { fullResults: true });
  const r = await q`SELECT id, role, text, created_at FROM messages ORDER BY id ASC`;
  const rows = (r as { rows: unknown[] }).rows;
  return Response.json({ v: "probe-exact", count: rows.length, rows });
}
