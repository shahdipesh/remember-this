import { NextRequest } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Temporary diagnostics. Protected by the same CRON_SECRET as /api/messages.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const diag: Record<string, unknown> = {};
  try {
    // Exactly what /api/messages does, step by step.
    await ensureSchema();
    diag.afterEnsure = "ok";
    const u = process.env.POSTGRES_URL || "";
    diag.dbHost = u.split("@")[1]?.split("/")[0] || "none";
    diag.dbName = u.split("@")[1]?.split("/")[1]?.split("?")[0] || "none";
    const sp = await sql`SHOW search_path`;
    diag.searchPath = sp.rows[0]?.search_path;
    const tbls = await sql`
      SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'messages'
    `;
    diag.messagesTables = tbls.rows;
    const cur = await sql`SELECT current_database() AS db, current_schema() AS sch`;
    diag.current = cur.rows[0];
    const { rows } = await sql`
      SELECT id, role, text, created_at FROM messages ORDER BY id ASC
    `;
    diag.messagesQueryCount = rows.length;
    diag.messagesQuerySample = rows.slice(0, 1);
    const c = await sql`SELECT COUNT(*)::int AS n FROM messages`;
    diag.countQuery = c.rows[0]?.n;
  } catch (err) {
    diag.dbError = err instanceof Error ? err.message : String(err);
  }
  return Response.json(diag);
}
