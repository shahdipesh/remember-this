import { NextRequest } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Staged "remember this" entries for the memory sweep.
 * The app files entries here at input time (/api/chat), so the sweep
 * collects them instead of re-scanning all messages.
 * Auth: ?secret=<CRON_SECRET> (same secret as the old /api/messages).
 */
async function checkSecret(req: NextRequest, bodySecret?: unknown): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const q = req.nextUrl.searchParams.get("secret");
  if (q && q === expected) return true;
  return typeof bodySecret === "string" && bodySecret === expected;
}

/** Unfiled entries, oldest first. */
export async function GET(req: NextRequest) {
  if (!(await checkSecret(req))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const sql = await getDb();
  // NOTE: No leading whitespace in SQL (Neon HTTP API quirk).
  const { rows } =
    await sql`SELECT id, text, thread_id, created_at FROM memory_entries WHERE filed = FALSE ORDER BY id ASC`;
  return Response.json(rows);
}

/** Mark entries as filed: { secret, ids: number[] }. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ids = (body as { ids?: unknown })?.ids;
  if (!(await checkSecret(req, (body as { secret?: unknown })?.secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n))) {
    return Response.json({ error: "ids must be an integer array" }, { status: 400 });
  }
  await ensureSchema();
  const sql = await getDb();
  if (ids.length > 0) {
    await sql`UPDATE memory_entries SET filed = TRUE WHERE id = ANY(${ids})`;
  }
  return Response.json({ ok: true, marked: ids.length });
}
