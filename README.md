# Omni Copilot

Omni Copilot is a full-stack assistant workspace for running multi-step conversations, executing connected tool actions, and preserving useful memory across follow-up prompts.

It is designed for practical assistant workflows, not just chat. A user can ask a question, connect external tools, execute an action, inspect timeline/plans, and continue from shared context in the same session.

## Table of Contents

- [What This Project Does](#what-this-project-does)
- [Core Features](#core-features)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Tech Stack (Brief)](#tech-stack-brief)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Run Locally](#run-locally)
- [Environment Variables](#environment-variables)
- [Routes](#routes)
- [API Endpoints](#api-endpoints)
- [Common Commands](#common-commands)
- [Development Notes](#development-notes)

## What This Project Does

Omni Copilot combines:

- A modern chat interface for long-running and context-aware conversations.
- A backend orchestration engine that routes requests to specialized agents.
- Tool integrations (Google, GitHub, Slack, Discord, Notion, and others) for real actions.
- Memory management so follow-up prompts can build on prior context.

Typical use cases:

- Ask the assistant to summarize and follow up on work across tools.
- Launch tool actions from one workspace instead of switching apps.
- Store and edit memory/context that improves future responses.
- Inspect agent signals and timeline behavior during complex tasks.

## Core Features

- Streaming chat responses with conversation flow designed for iterative work.
- Agent-driven orchestration across dialogue, memory, tools, knowledge, calendar, browser, and code.
- Integrations dashboard to connect/disconnect providers and inspect status.
- Memory editor to persist and refine context used in future prompts.
- Command board and workspace shell for fast navigation.
- Dedicated light and dark visual preview pages for UI verification.

## How It Works

1. The frontend sends user prompts to backend chat APIs.
2. The backend router selects the best-fit agent path.
3. Agents call tool adapters when external actions/data are needed.
4. Memory state is read/written during the interaction lifecycle.
5. The frontend streams assistant output and updates local UI state.

## Project Structure

```text
studio/  -> Next.js application (UI, auth, pages, local API routes)
engine/  -> FastAPI backend (agents, orchestration, tools, persistence)
```

Key areas:

- `studio/app/` for routes, layouts, and API route handlers.
- `studio/components/` for chat, tools, voice, and shared UI blocks.
- `engine/agents/` for orchestration logic and agent specialization.
- `engine/tools/` for integration adapters (Google, Slack, GitHub, etc.).
- `engine/api/` for chat, integrations, memory, and voice endpoints.
- `engine/data/` for local development database state.

## Tech Stack (Brief)

- Frontend: Next.js 14, TypeScript, Tailwind CSS.
- Backend: FastAPI, Python, agent-based orchestration.
- Data/State: SQLite for local development (with optional external services for expanded setups).

## Prerequisites

Install the following before setup:

- Node.js 18+ and npm.
- Python 3.10+.
- Git.

Optional for extended scenarios:

- Provider credentials for integrations (Google, GitHub, Slack, etc.).
- External DB/vector services if you are not running local-only defaults.

## Setup

Clone and enter the workspace:

```powershell
git clone <your-repo-url>
cd Omni-Copilot
```

Install frontend dependencies:

```powershell
cd studio
npm install
cd ..
```

Install backend dependencies in a virtual environment:

```powershell
cd engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

## Run Locally

Start backend (Terminal 1):

```powershell
cd engine
.venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

Start frontend (Terminal 2):

```powershell
cd studio
npm run dev
```

Open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/health`

## Environment Variables

Create two files:

- `studio/.env`
- `engine/.env`

Commonly used values:

### Frontend (`studio/.env`)

- `NEXTAUTH_SECRET=<random-secret>`
- `NEXTAUTH_URL=http://localhost:3000`
- `GOOGLE_CLIENT_ID=<google-client-id>`
- `GOOGLE_CLIENT_SECRET=<google-client-secret>`
- `BACKEND_API_URL=http://localhost:8000`

### Backend (`engine/.env`)

- `FRONTEND_APP_URL=http://localhost:3000`
- `OAUTH_REDIRECT_BASE_URL=http://localhost:3000`
- `JWT_SECRET=<jwt-secret>`
- `GROQ_API_KEY=<key>` or `OPENAI_API_KEY=<key>`

Additional variables may be required depending on which integrations and provider features you enable.

## Routes

- `/` landing page
- `/dark` dark preview route
- `/light` light preview route
- `/login` authentication flow
- `/chat/new` new conversation entry point
- `/integrations` tool connection management
- `/memory` persisted context editor

## API Endpoints

Core endpoints:

- `GET /health`
- `POST /api/chat/stream`
- `GET /api/integrations`
- `POST /api/integrations/{tool_id}/connect`
- `POST /api/integrations/{tool_id}/disconnect`
- `GET /api/memory`
- `POST /api/memory`

## Common Commands

From `studio/`:

- `npm run dev` - start local frontend
- `npm run build` - production build
- `npm run typecheck` - TypeScript validation

From `engine/`:

- `uvicorn main:app --reload --port 8000` - start backend in reload mode

## Development Notes

- Local development uses SQLite-backed state by default.
- Frontend keeps recent interaction state in local storage for smooth UX.
- Some advanced memory/integration deployments can be configured with external services.
- If chat responses fail, verify at least one LLM provider key is present in `engine/.env`.
