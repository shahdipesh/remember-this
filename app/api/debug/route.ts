import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Temporary diagnostics. Protected by the same CRON_SECRET as /api/messages.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const pgUrl = process.env.POSTGRES_URL || "";
  const diag: Record<string, unknown> = {
    hasPostgresUrl: !!pgUrl,
    // First chars only, to identify which database/host without leaking secrets.
    postgresUrlHead: pgUrl.slice(0, 40),
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlHead: (process.env.DATABASE_URL || "").slice(0, 40),
  };
  try {
    const t = await sql`
      SELECT to_regclass('public.messages') AS tbl
    `;
    diag.table = t.rows[0]?.tbl ?? null;
    if (diag.table) {
      const c = await sql`SELECT COUNT(*)::int AS n FROM messages`;
      diag.count = c.rows[0]?.n;
      const last = await sql`
        SELECT id, role, LEFT(text, 40) AS text, created_at
        FROM messages ORDER BY id DESC LIMIT 3
      `;
      diag.last = last.rows;
    }
  } catch (err) {
    diag.dbError = err instanceof Error ? err.message : String(err);
  }
  return Response.json(diag);
}
