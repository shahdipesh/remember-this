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

  // Test 1: plain SELECT (like before)
  const r1 = await q`SELECT id, role, text, created_at FROM messages ORDER BY id ASC`;
  const countBefore = (r1 as { rows: unknown[] }).rows.length;

  // Test 2: INSERT then SELECT (like the chat route does)
  await q`INSERT INTO messages (role, text) VALUES ('user', 'visibility-probe')`;
  const r2 = await q`SELECT id, role, text, created_at FROM messages ORDER BY id ASC`;
  const countAfter = (r2 as { rows: unknown[] }).rows.length;

  // Clean up the probe row
  await q`DELETE FROM messages WHERE text = 'visibility-probe'`;

  return Response.json({ countBefore, countAfter });
}
