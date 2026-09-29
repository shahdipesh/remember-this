import { NextRequest } from "next/server";

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
  // Inline neon() exactly as verified working (dynamic import).
  const { neon } = await import("@neondatabase/serverless");
  const q = neon(process.env.POSTGRES_URL!, { fullResults: true });
  await q`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  const result = await q`
    SELECT id, role, text, created_at FROM messages ORDER BY id ASC
  `;
  const rows = (result as { rows: unknown[] }).rows ?? result;
  return Response.json(rows);
}
