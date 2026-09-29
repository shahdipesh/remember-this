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
  return Response.json({
    v: "messages-v2",
    dbHost: (process.env.POSTGRES_URL || "").split("@")[1]?.split("/")[0] || "none",
    count: rows.length,
    rows,
  });
}
