import { NextRequest } from "next/server";
import { ensureSchema, db } from "@/lib/db";

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
  await ensureSchema();
  const { rows } = await db`
    SELECT id, role, text, created_at FROM messages ORDER BY id ASC
  `;
  return Response.json(rows);
}
