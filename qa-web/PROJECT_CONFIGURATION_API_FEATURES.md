# QA Web Project Configuration, API Connection, and Features

## 1. Project Overview

`qa-web` is a Next.js (App Router) application for running hosted website QA audits through a cloud browser provider.

Main capabilities:
- Start an audit for a hosted HTTPS site.
- Persist run state/results in Postgres.
- Poll cloud status and sync results.
- View audit history and audit details.
- Cancel active audits.
- Export report as JSON or Markdown.

## 2. Tech Stack and Core Dependencies

From `package.json`:
- Framework: Next.js `16.1.6`
- Runtime: React `19.2.3`
- Language: TypeScript (strict mode)
- Validation: `zod`
- Database client: `postgres` (Neon/Postgres compatible)
- UI: shadcn-style components + Radix primitives + Tailwind CSS

Important scripts:
- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - lint project
- `npm run db:setup` - create DB schema (`tsx scripts/setup-db.ts`)

## 3. Required Environment Variables

Used directly in source code:

- `DATABASE_URL`
  - Required by `lib/db/client.ts`
  - Postgres connection string

- `CLOUD_BROWSER_API_BASE_URL`
  - Required by `lib/cloud/client.ts`
  - Base URL for cloud browser provider API
  - Example: `https://your-cloud-browser-api.example.com`

- `CLOUD_BROWSER_API_KEY`
  - Required by `lib/cloud/client.ts`
  - Sent as Bearer token in `Authorization` header

If missing, server throws explicit runtime errors:
- `DATABASE_URL is required`
- `CLOUD_BROWSER_API_BASE_URL is required`
- `CLOUD_BROWSER_API_KEY is required`

## 4. Project Structure (High-Level)

- `app/`
  - UI routes and API routes (`app/api/...`)
- `components/`
  - UI and feature components (`AuditForm`, `AuditDetailClient`, etc.)
- `lib/contracts.ts`
  - Zod schemas and domain types
- `lib/audits/service.ts`
  - Orchestration layer (validate, start, sync, list, cancel)
- `lib/cloud/`
  - Cloud API client and payload mapper
- `lib/db/`
  - DB connection and repository methods
- `lib/reporting/markdown.ts`
  - Markdown export builder
- `scripts/setup-db.ts`
  - DB schema setup entrypoint

## 5. Data and Execution Flow

### Start Audit
1. Client submits form to `POST /api/audits`.
2. Request is parsed/validated with Zod (`auditRequestSchema`).
3. URL safety checks enforce hosted HTTPS (no localhost/private IP).
4. DB row is created in `audit_runs` with status `queued`.
5. App calls external cloud API `POST /audits`.
6. Returned external run id is stored; run status updated.

### Get Audit
1. Client (detail page) requests `GET /api/audits/:auditId`.
2. Service checks if run should sync (`THROTTLE_MS = 2000`).
3. If sync is needed, app calls cloud `GET /audits/:externalRunId`.
4. Cloud payload is mapped to internal schema (`pageResults`, `issues`, `artifacts`, `summary`, `progress`).
5. DB snapshot is updated and returned.

### Cancel Audit
1. Client calls `POST /api/audits/:auditId/cancel`.
2. Service attempts best-effort cloud cancel.
3. Internal DB status is set to `canceled`.

## 6. Internal API Endpoints

Base path: `/api/audits`

### `POST /api/audits`
Start a new audit.

Request body (validated by `auditRequestSchema`):
- `baseUrl: string (url)`
- `routes: string[]` (default `[]`)
- `viewports: [desktop, mobile]` (forced to default viewports in service)
- `maxPages: 1..10` (default `6`)
- `maxClicksPerPage: 1..10` (default `6`)
- `focus: usability | accessibility | security | content | functional` (at least one)

Responses:
- `202`: `{ auditId, status }`
- `400`: `{ error }`

### `GET /api/audits`
List audits with filters/pagination.

Query params:
- `status` (optional)
- `cursor` (optional positive int)
- `limit` (optional 1..50)
- `baseUrl` (optional string match)
- `dateFrom` (optional `YYYY-MM-DD`)
- `dateTo` (optional `YYYY-MM-DD`)

Response:
- `200`: `{ items: AuditListItem[], nextCursor: number | null }`
- `400`: `{ error }`

### `GET /api/audits/:auditId`
Get one audit status snapshot (includes cloud sync when eligible).

Responses:
- `200`: `AuditStatusResponse`
- `404`: `{ error: "Audit not found" }`
- `400`: `{ error }`

### `POST /api/audits/:auditId/cancel`
Cancel a run.

Responses:
- `200`: `{ ok: true, status: "canceled" }`
- `404`: `{ error: "Run not found" }`
- `400`: `{ error }`

### `GET /api/audits/:auditId/export?format=json|md`
Export report.

Behavior:
- `format=md`: markdown content with download filename `audit-<id>.md`
- `format=json` (default): JSON payload with filename `audit-<id>.json`

Responses:
- `200` export content
- `404`: `{ error: "Audit not found" }`
- `400`: `{ error }`

## 7. External Cloud API Connection

Configured in `lib/cloud/client.ts`.

Authentication:
- `Authorization: Bearer <CLOUD_BROWSER_API_KEY>`
- `content-type: application/json`

Cloud endpoints called:
- `POST {CLOUD_BROWSER_API_BASE_URL}/audits` - start run
- `GET {CLOUD_BROWSER_API_BASE_URL}/audits/:externalRunId` - fetch run snapshot
- `POST {CLOUD_BROWSER_API_BASE_URL}/audits/:externalRunId/cancel` - cancel run

Cloud start response parsing:
- Run id accepted from any of: `externalRunId`, `id`, `runId`, `auditId`
- Status accepted from `status` or `state` (defaults to `queued`)

Cloud snapshot mapping (`lib/cloud/mapper.ts`):
- Run status aliases are normalized to:
  - `queued | running | completed | failed | canceled`
- Page result aliases are normalized to:
  - `pending | running | ok | warning | error`
- Supports multiple source field names:
  - pages: `pageResults | results | pages`
  - issues: `issues | findings`
  - artifacts: `artifacts | evidenceLinks`

## 8. Database Configuration and Schema

Connection (`lib/db/client.ts`):
- Uses `postgres` client with:
  - `ssl: "require"`
  - `max: 1`
  - `prepare: false`
  - `idle_timeout: 20`
  - `connect_timeout: 15`

Schema creation (`ensureSchema`, executed by runtime + `npm run db:setup`):
- `audit_runs`
- `audit_page_results`
- `audit_issues`
- `audit_artifacts`

Indexes:
- `audit_runs(status, created_at DESC)`
- `audit_runs(base_url)`
- per-table `audit_id` indexes for detail tables

## 9. Validation and Safety Rules

From `lib/contracts.ts` and `lib/utils/urlSafety.ts`:
- Only `https://` base URLs are accepted.
- Local/private targets are rejected (`localhost`, `127.0.0.1`, `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`, `::1`).
- Routes are normalized and deduplicated.
- Max 20 normalized routes are kept.
- `maxPages` and `maxClicksPerPage` limited to `1..10`.

## 10. User-Facing Features

### Home (`/`)
- New audit form with:
  - base URL
  - optional routes
  - max pages
  - max clicks per page
  - focus areas

### Audit History (`/audits`)
- Filters by status, base URL, date range
- Paginated results (cursor-based)
- Per-run actions: `Open`, `Retry`

### Audit Detail (`/audits/:auditId`)
- Live polling for queued/running runs
- Refresh and Cancel actions
- Metrics summary (status, pages, pass/fail, high-risk)
- Progress section
- Route x viewport matrix
- Issue cards with evidence links
- Evidence gallery (screenshots)
- Export JSON/Markdown

## 11. Local Setup Checklist

1. Install deps:
   - `npm install`
2. Configure env vars:
   - `DATABASE_URL`
   - `CLOUD_BROWSER_API_BASE_URL`
   - `CLOUD_BROWSER_API_KEY`
3. Initialize DB schema:
   - `npm run db:setup`
4. Start app:
   - `npm run dev`

## 12. Notes for Integrators

- Internal API is strict-Zod validated; malformed payloads return `400`.
- Cloud provider payload shape is flexible due to mapper aliases.
- App stores raw inputs plus normalized snapshots, so exports are stable even if provider payload shape changes.
