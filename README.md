# remember-vercel

A minimal personal chat web app: chat UI with SSE-streamed assistant replies
(LangChain), full chat history in Postgres, and a `/harness` test view.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `POSTGRES_URL` | Yes | Set automatically by the Vercel Postgres / Neon marketplace integration. |
| `OPENROUTER_API_KEY` | One of the three | OpenRouter key → uses `OPENROUTER_MODEL` (default `google/gemma-4-26b-a4b-it:free`). Takes precedence when several keys are set. |
| `OPENROUTER_MODEL` | No | OpenRouter model id. Defaults to `deepseek/deepseek-v4.1-flash`. |
| `GEMINI_API_KEY` | One of the three | Google AI Studio key → uses `gemini-2.0-flash`. |
| `GROQ_API_KEY` | One of the three | Groq key → uses `llama-3.3-70b-versatile`. |
| `CRON_SECRET` | Yes | Shared secret for `GET /api/messages?secret=...`. Generate with `openssl rand -hex 32`. |
| `BASIC_AUTH_USER` | Yes | Username for the browser basic-auth login on `/` and `/harness`. |
| `BASIC_AUTH_PASS` | Yes | Password for the browser basic-auth login. |

If none of `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` is set, the chat replies with an
error message saying no LLM key is configured.

## API

- `POST /api/chat` — body `{ "message": "..." }`. Saves the user message,
  streams the assistant reply as SSE (`data: {"token":"..."}` frames, ending
  with `data: [DONE]`), then saves the full assistant reply. Requires basic
  auth (it is called from the authed UI).
- `GET /api/messages?secret=CRON_SECRET` — full history as
  `[{ id, role, text, created_at }]`. Returns 401 when the secret is missing or
  wrong. Not behind basic auth (it is polled by an external memory-filing job).
- `GET /api/history` — same as above but protected by basic auth, used by the UI.

## Deploy

1. Push this folder to a GitHub repo:
   ```bash
   git init && git add -A && git commit -m "remember chat"
   git remote add origin <your-repo-url> && git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → Add New → Project → import the repo.
3. Storage tab → add the Postgres integration (Neon marketplace). This creates
   `POSTGRES_URL` and friends automatically.
4. Settings → Environment Variables → add `OPENROUTER_API_KEY` (plus optional
   `OPENROUTER_MODEL`), `CRON_SECRET`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`.
   (`GEMINI_API_KEY` / `GROQ_API_KEY` are alternatives to OpenRouter.)
5. Deploy. The `messages` table is created automatically on first use
   (`schema.sql` holds the same DDL for reference).
6. Open the URL, log in with the basic-auth credentials, send a message, and
   check `/harness` to see the stored history.
