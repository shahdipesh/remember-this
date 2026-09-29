import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** TEMP: Delete all rows. */
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.POSTGRES_URL!, { fullResults: true });
  await sql`DELETE FROM messages WHERE id > 0`;
  const c = await sql`SELECT COUNT(*)::int AS n FROM messages`;
  const rows = (c as unknown as { rows: { n: number }[] }).rows;
  return Response.json({ countAfter: rows[0]?.n });
}
