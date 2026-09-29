let ensured = false;

async function getQuery() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");
  // Dynamic import: matches the pattern verified to work in production.
  const { neon } = await import("@neondatabase/serverless");
  return neon(url, { fullResults: true });
}

/**
 * Template tag like @vercel/postgres `sql`, backed by neon() directly
 * with a fresh query function per call. Avoids shared module-level pool
 * state, which proved unreliable in some route bundles.
 */
export async function db(strings: TemplateStringsArray, ...values: unknown[]) {
  const q = await getQuery();
  const result = await (q as unknown as (
    s: TemplateStringsArray,
    ...v: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[] }>)(strings, ...values);
  return result;
}

/** Create the messages table on first use (idempotent). */
export async function ensureSchema() {
  if (ensured) return;
  ensured = true;
  await db`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}
