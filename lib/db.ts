let ensured = false;

/**
 * Get a fresh neon() query function via dynamic import.
 * Use directly as a template tag.
 * NOTE: SQL template literals must NOT start with whitespace/newline —
 * the Neon HTTP API returns empty results for such queries.
 */
export async function getDb() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");
  const { neon } = await import("@neondatabase/serverless");
  return neon(url, { fullResults: true });
}

/** Create the messages table on first use (idempotent). */
export async function ensureSchema() {
  if (ensured) return;
  ensured = true;
  const sql = await getDb();
  await sql`CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`;
}
