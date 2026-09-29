import { NextRequest } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || secret !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const { rows } = await sql`
    SELECT id, role, text, created_at FROM messages ORDER BY id ASC
  `;
  const sp = await sql`SHOW search_path`;
  const tbls = await sql`
    SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'messages'
  `;
  const cur = await sql`SELECT current_database() AS db, current_schema() AS sch`;
  return Response.json({
    v: "messages-v2",
    dbHost: (process.env.POSTGRES_URL || "").split("@")[1]?.split("/")[0] || "none",
    searchPath: sp.rows[0]?.search_path,
    messagesTables: tbls.rows,
    current: cur.rows[0],
    count: rows.length,
    rows,
  });
}
