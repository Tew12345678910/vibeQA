# EduQA Web Auditor (Vercel Next.js)

Run-centric web auditor for hosted HTTPS apps. The app starts audits on a cloud browser service, tracks status, and renders educational results for desktop and mobile.

## What This Repo Contains

- `web/`: Next.js App Router frontend + API routes
- `data/`: local scratch folder (not used in production)

## Product Scope

- Hosted URL input only (`https://`)
- Viewports: desktop `1440x900` and mobile `390x844`
- Async audit lifecycle: `queued`, `running`, `completed`, `failed`, `canceled`
- Results: page x viewport matrix, issue cards, evidence links, JSON/Markdown export
- Persistence: Neon Postgres (`DATABASE_URL`)

## Removed Legacy Stack

Python agent scripts, suite/testcase manifest generation, local worker orchestration, and SQLite report exports were removed.

## Requirements

- Node.js 20+
- npm 10+
- Neon Postgres database
- Cloud browser API endpoint + API key

## Environment

Create `web/.env.local` from `web/.env.example`:

```bash
cd web
cp .env.example .env.local
```

Required variables:

```env
DATABASE_URL=postgres://...
CLOUD_BROWSER_API_BASE_URL=https://your-cloud-browser-api.example.com
CLOUD_BROWSER_API_KEY=...
APP_BASE_URL=http://localhost:3000
# Optional RAG embedder (Python sentence-transformers service)
RAG_EMBEDDER_URL=http://127.0.0.1:8001/embeddings/embed
RAG_EMBEDDING_DIMENSIONS=384
```

## Python Embedding Service (Sentence-Transformers)

RAG embeddings can run locally without OpenAI by using the Python service in `api/`.

```bash
cd api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn cloud_api:app --reload --host 0.0.0.0 --port 8001
```

Available endpoints:

- `GET /embeddings/health`
- `POST /embeddings/embed` with body `{ "text": "..." }`

## Local Development

```bash
cd web
npm install
npm run db:setup
npm run dev
```

Open `http://localhost:3000`.

## API Endpoints

- `POST /api/audits` start audit
- `GET /api/audits` list audits
- `GET /api/audits/:auditId` get latest audit status/results (includes cloud sync for active runs)
- `POST /api/audits/:auditId/cancel` cancel run
- `GET /api/audits/:auditId/export?format=json|md` export report

## Deployment (Vercel)

Set project root to `web/`.

Set environment variables in Vercel:

- `DATABASE_URL`
- `CLOUD_BROWSER_API_BASE_URL`
- `CLOUD_BROWSER_API_KEY`
- `APP_BASE_URL`

Build command:

```bash
npm run build
```

Install command:

```bash
npm install
```
