import { NextRequest } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || secret !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // TEMP DEBUG: ensureSchema disabled to isolate the issue
  // await ensureSchema();
  const { rows } = await sql`
    SELECT id, role, text, created_at FROM messages ORDER BY id ASC
  `;
  const sp = await sql`SHOW search_path`;
  const tbls = await sql`
    SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'messages'
  `;
  const cur = await sql`SELECT current_database() AS db, current_schema() AS sch`;
  const usr = await sql`SELECT current_user AS u, session_user AS s`;
  const rls = await sql`
    SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'messages'
  `;
  const pol = await sql`SELECT policyname, permissive, roles, cmd, qual FROM pg_policies WHERE tablename = 'messages'`;
  const { createHash } = await import("crypto");
  const connHash = createHash("sha256").update(process.env.POSTGRES_URL || "").digest("hex").slice(0, 16);
  let connParts: unknown = "parse-error";
  try {
    const u2 = new URL((process.env.POSTGRES_URL || "").replace("postgresql://", "https://"));
    connParts = { user: u2.username, host: u2.hostname, db: u2.pathname, params: u2.search };
  } catch { /* ignore */ }
  return Response.json({
    v: "messages-v2",
    sha: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    connHash,
    connParts,
    searchPath: sp.rows[0]?.search_path,
    current: cur.rows[0],
    user: usr.rows[0],
    count: rows.length,
    rows,
  });
}
