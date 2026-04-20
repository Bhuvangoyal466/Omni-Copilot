# Horizon Desk Runbook

This file is the quick local setup for the rebranded workspace.

## Folder Map

- `studio/` - Next.js app, auth, routes, and shared UI
- `engine/` - FastAPI app, agents, tools, and persistence

## Prerequisites

- Python 3.11+ or compatible 3.10+
- Node.js 18+ or newer
- npm

Optional keys:

- Groq API key
- OpenAI API key
- OAuth credentials for Google, GitHub, Notion, Slack, and Discord

## Start The Engine

```powershell
cd engine
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Create `engine/.env` with at least:

- `JWT_SECRET`
- `FRONTEND_APP_URL=http://localhost:3000`
- `OAUTH_REDIRECT_BASE_URL=http://localhost:3000`
- `CORS_ALLOW_ORIGINS=http://localhost:3000`

## Start The Studio

```powershell
cd studio
npm install
npm run dev
```

Create `studio/.env` with at least:

- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL=http://localhost:3000`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `BACKEND_API_URL=http://localhost:8000`

## Login Flow

1. Open `http://localhost:3000`
2. Sign in with Google
3. Open the chat workspace
4. Connect integrations when needed

## OAuth Notes

Register the callback routes from the README in your provider consoles. The frontend proxies them through `/api/integrations/*/callback` and `/api/integrations/*/connect`.

## Troubleshooting

- If responses are generic, set `GROQ_API_KEY` or `OPENAI_API_KEY`.
- If memory looks empty, confirm the same `userId` is being used and that `engine/data/` is writable.
- If login fails, recheck Google client credentials and `NEXTAUTH_SECRET`.
- If integrations fail, verify the provider credentials and callback URLs.

## Quick Commands

```powershell
cd engine
uvicorn main:app --reload --port 8000

cd ..\studio
npm run dev
```
