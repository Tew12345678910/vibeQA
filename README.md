# VibeQA

VibeQA helps developers catch quality issues that AI coding tools miss ([tryvibeqa.vercel.app](https://tryvibeqa.vercel.app)). AI can write code quickly, but it often skips important details like security checks, error handling, and user experience polish. VibeQA scans your repos and tests your app in a real browser, then gives you clear, actionable feedback with fixes.

## Product Vision

- Replace passive lint-style output with practical, teachable feedback.
- Teach developers how to control AI systems, not just consume their output.
- Convert each issue into reusable learning material so the same mistake is less likely to happen again.

## End-to-End Flow

1. User logs in with GitHub.
2. User selects a repository the app can access.
3. Web pipeline scans the repo to infer framework/router/routes.
4. RAG pipeline evaluates code against rule sets (limitations, security, reliability, quality).
5. Findings are ranked (`P0`, `P1`, `P2`) and enriched with educational guidance.
6. Route + context payload is sent to the Bedrock browser agent API.
7. Browser Use explores pages in multiple orientations/screen sizes and returns runtime findings.
8. Web app maps all findings into a unified card format with evidence, impact, remediation, and learning notes.

## The Blind Spot This Project Solves

AI coding tools are good at producing code that compiles and appears functional.  
They are not consistently good at enforcing production-grade quality defaults.

VibeQA focuses on two common blind spots:

1. Static quality and security gaps in generated code.
Examples: missing validation, missing rate limits, weak authz checks, inconsistent error contracts, missing idempotency, poor observability.

2. Runtime UX and behavior gaps only visible in a browser.
Examples: inaccessible elements, broken mobile layouts, forms without feedback, redirect loops, unresolved loading states.

The platform combines both perspectives so teams do not ship "works on my machine" code that fails in production conditions.

## How Findings Become Learning Material

VibeQA is designed to produce more than a bug list.

Each card is meant to teach a repeatable engineering pattern:

- what failed (`P0`, `P1`, `P2`, category, scope)
- why it matters (user impact + risk model)
- grounded evidence (file/line or browser observation)
- concrete implementation steps
- acceptance criteria for verification
- a "rule of thumb" to prevent repeating the class of issue

This "issue -> explanation -> fix -> principle" loop is the core learning model of the product.

## Common Issue Patterns

- `P0 Security/Auth`: login endpoints without rate limiting.
- `P0 Security/CSRF`: state-changing routes that accept untrusted origins.
- `P1 Validation`: request bodies/params used without schema parsing.
- `P1 Observability`: no request ID for traceability.
- `P1 Accessibility`: missing `alt` text and weak interaction semantics.
- `P2 API Design`: unbounded list endpoints without pagination limits.
and more than 100+ Patterns in the vector database.

These are high-frequency patterns in AI-generated projects and can usually be fixed quickly once surfaced clearly.

## Product Philosophy

The goal is not to push developers away from AI coding.  
The goal is to help developers become high-signal operators of AI systems:

- direct AI with better constraints
- verify outputs with stronger standards
- fix with clear reasoning instead of cargo-cult patches
- build intuition that transfers to the next project

In short: connect a repo, run a scan, and get a practical curriculum for improving both the codebase and the developer.

## Repository Layout

- `qa-web/`: Next.js (App Router) product UI and server routes.
- `api/`: FastAPI service for Bedrock + Browser Use route audits.
- `qa-web/supabase/migrations/`: schema for projects/runs/issues/rules/vector chunks.

## Core Capabilities

- GitHub OAuth + repository picker.
- Repo framework/route analysis (`/api/pipeline/analysis/github`).
- Rule-based RAG audit with vector retrieval and AI-generated issue cards.
- Browser review orchestration and run polling.
- Unified issue report with educational sections:
  - why it matters
  - rule of thumb
  - concrete implementation steps
  - acceptance criteria
- Supabase persistence for projects, runs, issues, rules, and vector chunks.

## Current/Target Integration Notes

- The architecture is designed for web -> browser-agent API integration.
- The Python API in `api/` exposes `/audits` endpoints and runs Bedrock + Browser Use.
- The web pipeline expects a browser review service and merges returned findings into the same issue card model.
- There is still a local mock browser route in `qa-web/app/api/pipeline/browser-scan/route.ts`; this README documents the intended integrated operating mode.

## Web API Surface (`qa-web`)

- `POST /api/pipeline/analysis/github`
- `POST /api/pipeline/scans/github`
- `GET /api/pipeline/scans/:scanId`
- `POST /api/pipeline/reviews`
- `GET /api/pipeline/issues/:runId`
- `GET /api/issues?runId=<RUN_ID>`
- `GET|POST /api/projects`
- `PATCH|DELETE /api/projects/:id`
- `GET|POST /api/projects/:id/runs`
- `GET /api/projects/:id/runs/:runId`
- `GET /api/github/repos`

## Browser Agent API Surface (`api`)

- `POST /audits`
- `GET /audits/{run_id}`
- `POST /audits/{run_id}/cancel`

The API builds a route test plan and runs Browser Use with AWS Bedrock-backed LLM orchestration, returning route-level UI/UX findings (`good_points`, `problems`).

## Data Model (Supabase)

Key tables:

- `projects`
- `project_runs`
- `run_issues`
- `rules`
- `control_chunks` (rule embeddings)
- `code_chunks` (repo chunk embeddings)

This enables:

- per-user project history
- ranked run snapshots
- rule retrieval + code retrieval for RAG grounding
- durable issue cards with evidence metadata

## Prerequisites

- Node.js 20+
- pnpm 10+
- Python 3.11+
- Supabase project
- AI provider key (`AI_API_KEY`) for embeddings + issue generation
- AWS credentials + Bedrock access for browser agent execution

## Environment

### `qa-web/.env.local`

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY= # or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
SUPABASE_SECRET_KEY= # or SUPABASE_SERVICE_ROLE_KEY
AI_API_KEY=
```

Optional/advanced:

```env
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=qa-project-artifacts
AI_BASE_URL=https://api.openai.com/v1
AI_CHAT_MODEL=gpt-4o-mini
AI_EMBEDDING_MODEL=text-embedding-3-small
BROWSER_USE_SERVER_BASE_URL=
BROWSER_USE_SERVER_API_KEY=
CLOUD_BROWSER_API_BASE_URL=
CLOUD_BROWSER_API_KEY=
```

### Root/API env (for `api/`)

```env
AGENTCORE_BROWSER_REGION=us-west-2
BEDROCK_MODEL_ID=us.amazon.nova-pro-v1:0
AGENTCORE_BROWSER_ID=               
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

## Local Development

### 1) Web app

```bash
cd qa-web
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### 2) Python browser-agent API

From repo root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn api.cloud_api:app --reload --host 0.0.0.0 --port 8001
```

### 3) Rules and vector indexing (recommended for RAG quality)

```bash
cd qa-web
pnpm rules:upsert:all
pnpm rules:index
```

## Why This Project Matters

VibeQA is not just a scanner. It is a training system for AI-era developers:

- learn to review AI output with standards-based reasoning
- learn to fix root causes, not only symptoms
- learn repeatable patterns for safer and more reliable AI-assisted shipping

If you can direct the agent, validate the output, and close the loop with evidence-backed fixes, you can ship faster without losing engineering quality.
