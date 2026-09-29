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
    const usr = await sql`SELECT current_user AS u, session_user AS s`;
    diag.user = usr.rows[0];
    diag.sha = process.env.VERCEL_GIT_COMMIT_SHA || "unknown";
    const { createHash } = await import("crypto");
    diag.connHash = createHash("sha256").update(process.env.POSTGRES_URL || "").digest("hex").slice(0, 16);
    const poolConnStr = (sql as unknown as { connectionString?: string }).connectionString || "";
    diag.poolHash = createHash("sha256").update(poolConnStr).digest("hex").slice(0, 16);
    diag.poolHashShown = true;
    // Fresh neon() call, bypassing the shared `sql` proxy/pool.
    const { neon } = await import("@neondatabase/serverless");
    const fresh = neon(process.env.POSTGRES_URL!, { fullResults: true });
    const fr = await fresh(`SELECT id, role, text, created_at FROM messages ORDER BY id ASC`);
    diag.freshCount = Array.isArray(fr) ? fr.length : (fr as any).rows?.length;
    // Same query but with explicit empty params array (what VercelPool.sql passes).
    const fr2 = await fresh(`SELECT id, role, text, created_at FROM messages ORDER BY id ASC`, []);
    diag.freshEmptyParamsCount = Array.isArray(fr2) ? fr2.length : (fr2 as any).rows?.length;
    // Exact template-literal whitespace as VercelPool.sql would send.
    const fr3 = await fresh(`
      SELECT id, role, text, created_at FROM messages ORDER BY id ASC
    `, []);
    diag.freshWhitespaceCount = Array.isArray(fr3) ? fr3.length : (fr3 as any).rows?.length;
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
