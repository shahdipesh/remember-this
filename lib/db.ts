let ensured = false;

/**
 * Get a fresh neon() query function (dynamic import).
 * Use directly as a template tag: `const sql = await getDb(); await sql`SELECT ...``
 * A fresh instance per call avoids the shared module-level pool state
 * that proved unreliable in some route bundles.
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
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}
