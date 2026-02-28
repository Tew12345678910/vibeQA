# VibeQA

The QA education layer for AI-assisted development.

VibeQA runs two agents on every scan:
- a **code analysis agent** for repository-level checks
- a **browser agent** for runtime behavior on the live site

Instead of just listing bugs, it explains **why each issue matters** and gives **concrete fix steps**.

## What This Repo Contains

- **`qa-web/`** — main Next.js app (landing page, product UI, API routes)
- **`api/`** — Python Cloud Browser API: UI/UX audits via AWS Bedrock AgentCore + browser-use (one agent run per route; returns `routes` with `good_points` and `problems` per route)

## Cloud Browser API (`api/`)

The Python service runs a headless browser against your site and returns UI/UX findings per route.

### Run the API

```bash
# From repo root; use a venv and install deps first
pip install -r requirements.txt
python -m uvicorn api.cloud_api:app --reload --host 0.0.0.0 --port 8001
```

Docs: `http://localhost:8001/docs`

### Environment (project root `.env`)

Required for the browser agent:

```env
AGENTCORE_BROWSER_REGION=us-west-2   # or BEDROCK_REGION
# AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or default credential chain)
```

```env
BEDROCK_MODEL_ID=us.amazon.nova-pro-v1:0
AGENTCORE_BROWSER_ID=your-browser-tool-id
```

### Audit endpoints

| Method | Path                      | Description                                                                                                                    |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/audits`                 | Start audit. Body: `{ "baseUrl": "https://example.com", "routes": ["/", "/about"] }`. Returns `{ "externalRunId", "status" }`. |
| `GET`  | `/audits/{run_id}`        | Get result: `{ "status", "runMode", "routes": [{ "route", "good_points", "problems" }] }`.                                     |
| `POST` | `/audits/{run_id}/cancel` | Cancel (no-op for current sync implementation).                                                                                |

The agent runs **once per route**; send all paths you want in `routes`. Each item in `routes` is a `RouteAuditResult`: `route` (path), `good_points` (list of strings), `problems` (list of strings), UI/UX only.

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

- **qa-web:** Node.js 20+, pnpm 10+, Supabase project (URL + keys), OpenAI-compatible API key for AI analysis
- **api/ (Cloud Browser API):** Python 3.10+, AWS credentials, Bedrock AgentCore Browser access; see `requirements.txt`

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

## Main API Routes (qa-web)

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
