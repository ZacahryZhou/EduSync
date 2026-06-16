# EduSync AI (Phase 3)

Teacher-only assistant powered by **DeepSeek**. See `docs/DEVELOPMENT-ROADMAP.md` Phase 3.

**Safety policy (required):** [`docs/AI-SAFETY-POLICY.md`](./AI-SAFETY-POLICY.md) — scope, confidentiality, and system prompt rules.

## Environment variables

Add to **`backend/.env`** (copy from `backend/.env.example`):

```env
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_API_BASE=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

| Variable | Required | Default |
|----------|----------|---------|
| `DEEPSEEK_API_KEY` | Yes | — |
| `DEEPSEEK_API_BASE` | No | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | No | `deepseek-chat` |

Get a key: https://platform.deepseek.com/api_keys

**Railway:** add the same variables in the backend service → Variables, then redeploy.

Never put `DEEPSEEK_API_KEY` in the frontend or `VITE_*` env.

## Database

Run once in Supabase SQL Editor:

```bash
# file: backend/sql/create_ai_interactions.sql
```

## API (teacher JWT required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/status` | `{ configured, model }` |
| POST | `/api/ai/chat` | SSE stream; body `{ messages: [{ role, content }] }` |

SSE events: `{ "type": "token", "content": "..." }`, `{ "type": "done" }`, `{ "type": "error", "message": "..." }`.

## Local dev

```bash
# terminal 1
cd backend && FLASK_APP=app .venv/bin/flask run --port 5001

# terminal 2
cd .. && VITE_API_URL=http://127.0.0.1:5001/api npm run dev -- --port 8080
```

Open Calendar as a teacher → AI Assistant card.

## Current scope (AI-0)

- Streaming chat UI on Calendar page
- DeepSeek replies with teacher system prompt
- `ai_interactions` logging (optional if SQL not run)

## Next (AI-1 / AI-2)

- **AI-1:** read tools (`list_sessions`, `list_students`, …)
- **AI-2:** write tools with confirm cards
- **AI-2b:** file upload import (PDF, xlsx, docx)
