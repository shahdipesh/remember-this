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

/** Create tables on first use (idempotent). */
export async function ensureSchema() {
  if (ensured) return;
  ensured = true;
  const sql = await getDb();
  await sql`CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS threads (id SERIAL PRIMARY KEY, title TEXT NOT NULL DEFAULT 'New chat', created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE`;
  // Backfill: make sure there is at least one thread and attach orphan messages to it.
  const { rows } = await sql`SELECT id FROM threads ORDER BY id ASC LIMIT 1`;
  let defaultId: number;
  if (rows.length === 0) {
    const r = await sql`INSERT INTO threads (title) VALUES ('General') RETURNING id`;
    defaultId = Number(r.rows[0].id);
  } else {
    defaultId = Number(rows[0].id);
  }
  await sql`UPDATE messages SET thread_id = ${defaultId} WHERE thread_id IS NULL`;
  // Staging table for "remember this" entries: the app files them at input
  // time (/api/chat), and the memory sweep collects unfiled ones.
  await sql`CREATE TABLE IF NOT EXISTS memory_entries (id SERIAL PRIMARY KEY, text TEXT NOT NULL, thread_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(), filed BOOLEAN DEFAULT FALSE)`;
  // One-time backfill: catch remember-intent messages that arrived before this table existed.
  await sql`INSERT INTO memory_entries (text, thread_id, created_at) SELECT m.text, m.thread_id, m.created_at FROM messages m WHERE m.role = 'user' AND (m.text ILIKE '%remember%' OR m.text ILIKE '%don''t forget%') AND NOT EXISTS (SELECT 1 FROM memory_entries e WHERE e.text = m.text)`;
}

/** Same remember-intent rule the sweep used: "remember" or "don't forget". */
export function hasRememberIntent(text: string): boolean {
  return /remember|don't forget/i.test(text);
}
