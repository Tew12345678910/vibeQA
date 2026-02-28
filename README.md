# VibeQA

The QA education layer for AI-assisted development.

VibeQA runs two agents on every scan:
- a **code analysis agent** for repository-level checks
- a **browser agent** for runtime behavior on the live site

Instead of just listing bugs, it explains **why each issue matters** and gives **concrete fix steps**.

## What This Repo Contains

- `qa-web/` — main Next.js app (landing page, product UI, API routes)
- `api/` — Python service modules used for browser/review workflows and supporting logic
- `aws/` — cloud/browser-related helpers

## Product Flow (Matches Landing Page)

1. Drop your GitHub repo (or URL + website URL).
2. VibeQA runs code + browser analysis in parallel.
3. You get prioritized P0/P1/P2 findings with evidence, impact, and fix guidance.

## Core Features

- GitHub repo intake (picker + URL)
- Project/run pipeline (`/projects/new` -> `/projects/:id/run`)
- Framework + route analysis for repo context
- Unified issue report with educational guidance
- Supabase-backed persistence for projects, runs, and issues

## Requirements

- Node.js 20+
- pnpm 10+
- Supabase project (URL + keys)
- OpenAI-compatible API key for AI analysis

## Local Development

```bash
cd qa-web
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Environment (`qa-web/.env.local`)

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY= # or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
SUPABASE_SECRET_KEY= # or SUPABASE_SERVICE_ROLE_KEY
AI_API_KEY=
```

Also supported:

```env
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AI_BASE_URL=
AI_CHAT_MODEL=
AI_EMBEDDING_MODEL=
SUPABASE_STORAGE_BUCKET=qa-project-artifacts
BROWSER_USE_SERVER_BASE_URL=
BROWSER_USE_SERVER_API_KEY=
CLOUD_BROWSER_API_BASE_URL=
CLOUD_BROWSER_API_KEY=
```

## Main API Routes

- `POST /api/pipeline/analysis/github`
- `POST /api/pipeline/scans/github`
- `POST /api/pipeline/reviews`
- `GET /api/pipeline/issues/:runId`
- `GET /api/issues?runId=<RUN_ID>`
- `GET|POST /api/projects`
- `PATCH|DELETE /api/projects/:id`
- `GET|POST /api/projects/:id/runs`

## Notes

- The current app shell and landing branding are **VibeQA**.
- If you deploy to Vercel, set the project root to `qa-web/`.
