import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** TEMP: Delete all test rows. Remove after cleanup. */
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.POSTGRES_URL!, { fullResults: true });
  const r = await sql`DELETE FROM messages`;
  return Response.json({ deleted: (r as { count?: number }).count ?? "unknown" });
}
