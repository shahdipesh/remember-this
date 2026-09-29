import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** TEMP: Identify database backend. */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sql = await getDb();
  const r = await sql`SELECT current_database() AS db, version() AS ver`;
  const rows = (r as unknown as { rows: { db: string; ver: string }[] }).rows;
  // Return host from URL (without password)
  const url = process.env.POSTGRES_URL || "";
  const host = url.replace(/:\/\/[^@]+@/, "://***@").split("?")[0];
  return Response.json({ db: rows[0]?.db, host, ver: rows[0]?.ver?.split(" ")[0] });
}
