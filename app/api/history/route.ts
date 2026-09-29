import { ensureSchema, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Full history for the authed UI (basic auth enforced by middleware). */
export async function GET() {
  await ensureSchema();
  const sql = await getDb();
  const { rows } = await sql`SELECT id, role, text, created_at FROM messages ORDER BY id ASC`;
  return Response.json(rows);
}
