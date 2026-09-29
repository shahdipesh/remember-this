import { sql } from "@vercel/postgres";

let ensured = false;

/** Create the messages table on first use (idempotent). */
export async function ensureSchema() {
  if (ensured) return;
  ensured = true;
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export { sql };
