# BrowserQA Unified Pipeline — Project Configuration, API, and Features

Last verified against codebase: 2026-02-28.

## 0. Tech Stack

| Layer | Library / Version |
|-------|-------------------|
| Framework | Next.js `16.1.6` (App Router only) |
| UI runtime | React `19.2.3` |
| Language | TypeScript (strict) |
| Package manager | `pnpm@10.30.0` |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| Auth | better-auth (`lib/auth.ts`, `lib/auth-client.ts`) |
| Database / Storage | Supabase JS v2 (`lib/db/`, `lib/cloud/`) |
| Validation | Zod v4 (`lib/project-auditor/schemas.ts`, `lib/contracts.ts`) |
| AI | OpenAI via `lib/ai.ts` (server-only) |
| Zip ingestion | `unzipper` (zip-based scan — in progress) |

---

## 1. Current Architecture (Single Pipeline)
The repository is now centered on a unified project QA pipeline with these core building blocks:

1. GitHub repository intake (OAuth + repository picker or URL)
2. Project analysis scan (framework + router + route purposes)
3. Static scanner for Next.js API and standards checks
4. AI report generation from scanner outputs
5. Browser-use review orchestration (server-side, async)
6. Unified issues result contract (`report` + `cards`)

The **supported entry route** is `/projects/new`.

## 2. Supported UI Routes

### Pipeline (supported flow)
- `/projects/new` — New project creation form; GitHub repo picker or manual URL; optional website URL
- `/projects/[projectId]/run` — Run page; supports:
  - dedicated project analysis scan (framework + routes)
  - auto analysis when missing
  - normal scan modes (`Codebase`, `URL`, `Both`)
  - route-scope rerun (`All pages`, `Analyzed pages`)
  - analyzed route tree in sidebar
- `/auth/github-callback` — Supabase GitHub OAuth callback; stores `github_provider_token` in `sessionStorage`
- `/issues?runId=<RUN-ID>` — Renders unified issue report from `GET /api/issues`

### Additional app routes
- `/` — Root (redirects or landing)
- `/landing` — Marketing/landing page
- `/login` — Login page (`components/browserqa/LoginClient.tsx`)
- `/auth` — Auth entry
- `/dashboard` — Dashboard (`components/browserqa/DashboardClient.tsx`)
- `/profile` — User profile (`components/browserqa/ProfileClient.tsx`)
- `/settings` — Account settings (`components/browserqa/SettingsPageClient.tsx`)
- `/projects` — Projects list (`components/browserqa/ProjectsPageClient.tsx`)
- `/projects/[projectId]` — Project detail (`components/browserqa/ProjectDetailClient.tsx`)
- `/runs` — Runs list (`components/browserqa/RunsPageClient.tsx`)
- `/runs/[auditId]` — Run detail (`components/browserqa/RunDetailClient.tsx`)
- `/audits` — Audits list
- `/audits/[auditId]` — Audit detail

The **primary supported pipeline entry** is `/projects/new`.

## 3. Active API Endpoints
### Auth
- `POST|GET /api/auth/[...all]`
  - better-auth handler (existing auth integration)

### GitHub source discovery
- `GET /api/github/repos`
  - Header: `x-github-token: <provider_token>`
  - Returns repositories visible to the authenticated GitHub user (public/private according to token scope)

### Project management
- `GET /api/projects`
  - Returns all projects ordered by `created_at DESC`
  - Response: `{ projects: ProjectRow[] }`

- `POST /api/projects`
  - Creates or upserts a project in `public.projects`
  - Body: `{ id, name, sourceType?, githubRepo?, websiteUrl?, baseUrl?, configJson? }`
  - Returns `201 { ok: true }`

- `PATCH /api/projects/:id`
  - Updates `name`, `github_repo`, `website_url`, and/or `config_json` for a project
  - Body: `{ name?, githubRepo?, websiteUrl?, configJson? }`
  - Returns `200 { ok: true }`

- `DELETE /api/projects/:id`
  - Deletes project row (cascades to `project_runs` and `run_issues`)
  - Returns `200 { ok: true }`

### Run management
- `GET /api/projects/:id/runs`
  - Returns all runs for a project (newest first, capped at 50) with their issues embedded
  - Response: `{ runs: ProjectRunRow[] }` where each run includes `issues: RunIssueRow[]`

- `POST /api/projects/:id/runs`
  - Saves a completed scan run and its issues to `public.project_runs` + `public.run_issues`
  - Body:
    - `id`
    - `createdAt?`
    - `counts: { p0, p1, p2, total }`
    - `analysis?: { framework?, router?, routes?: Array<{ path, purpose, criticality? }> }`
    - `metaJson?`
    - `issues: IssueInput[]` where each issue may include `cardJson`, `filePath`, `endpoint`, `confidence`, `state`
  - Returns `201 { ok: true }`

- `GET /api/projects/:id/runs/:runId`
  - Returns a single run snapshot with status and normalized counts
  - Used by the run page to poll long-running repository scans
  - Response shape:
    - `run: { id, projectId, createdAt, counts, meta }`
    - `status`
    - `counts`
    - `issues`

### Pipeline scan/review/issues
- `POST /api/pipeline/analysis/github`
  - Route file: `app/api/pipeline/analysis/github/route.ts` → calls `analyzeGithubRoutesAndFramework()`
  - Dedicated framework + route analysis endpoint (separate from RAG issue scanning)
  - Input JSON:
    - `repoUrl: string` (required)
    - `projectName?: string`
    - `githubToken?: string` (optional; may also be sent via `x-github-token` header)
  - Returns:
    - `scanId`
    - `project: { name, framework, router }`
    - `routes`
    - `routeInsights` (path + purpose + criticality)
    - `endpointCount`

- `POST /api/pipeline/scans/github`
  - Route file: `app/api/pipeline/scans/github/route.ts` → calls `scanGithubRepo()`
  - Input JSON:
    - `repoUrl: string` (required)
    - `projectName?: string`
    - `githubToken?: string` (optional; may also be sent via `x-github-token` header)
    - `projectId?: string` (optional; when supplied with `runId`, allows per-run persistence/polling)
    - `runId?: string` (optional)
    - `analysisOnly?: boolean` (optional compatibility mode; prefer `/api/pipeline/analysis/github`)
  - Behavior:
    - Runs RAG/static repository audit for issue detection
    - Refreshes framework + route analysis via the dedicated analysis service
  - Returns:
    - `scanId`, project metadata, summary, route list, `routeInsights` (path + purpose + criticality), and local issue cards

- `POST /api/pipeline/browser-scan`
  - Mock browser scan endpoint for run page integration
  - Input JSON:
    - `url: string`
    - `projectName?: string`
    - `instruction?: string`
    - `routes?: string[]` (used for analysis-only reruns)
  - Returns:
    - `issues: Array<{ id, title, priority, category, description }>`

- `POST /api/pipeline/scans/zip` *(in progress — route directory exists, implementation pending)*
  - Will accept a zip upload and run the same static scan pipeline as the GitHub path

- `GET /api/pipeline/scans/:scanId`
  - Route file: `app/api/pipeline/scans/[scanId]/route.ts` → calls `getScanPreview()`
  - Returns scan preview, report summary, local cards

- `POST /api/pipeline/reviews`
  - Route file: `app/api/pipeline/reviews/route.ts` → calls `confirmProjectReview()`
  - Input JSON:
    - `scanId: string`
    - `baseUrl: string` (must pass hosted HTTPS validation via `validateHostedHttpsUrl`)
  - Behavior:
    - Creates run state
    - Starts browser-use review if server is configured
    - Persists browser request payload artifact
  - Returns:
    - `runId`, `issuePageUrl`, initial report and local cards

- `GET /api/pipeline/issues/:runId`
  - Route file: `app/api/pipeline/issues/[runId]/route.ts` → calls `getIssuesReport()`
  - Polls/refreshes run state
  - If browser-use review is running, updates status
  - If completed, ingests findings and merges remote cards

- `GET /api/issues?runId=<RUN-ID>`
  - Route file: `app/api/issues/route.ts` → calls `getIssuesReport()`
  - Public issue fetch contract used by issues page
  - Delegates to the same pipeline service function as `GET /api/pipeline/issues/:runId`

## 4. Required Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (optional; default: `qa-project-artifacts`)
- `OPENAI_API_KEY` (optional; fallback report used when missing)
- `OPENAI_MODEL` (optional; default `gpt-4.1-mini`)
- `BROWSER_USE_SERVER_BASE_URL` (optional; when missing, remote review state becomes `disabled`)
- `BROWSER_USE_SERVER_API_KEY` (optional)

## 5. Supabase Tables

### `public.projects`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `text` | NO | Client-generated UUID |
| `name` | `text` | NO | |
| `source_type` | `text` | NO | `'github'` or `'local'` |
| `github_repo` | `text` | YES | Full GitHub URL |
| `website_url` | `text` | YES | |
| `base_url` | `text` | NO | |
| `config_json` | `jsonb` | NO | Extra config blob |
| `created_at` | `timestamptz` | NO | |
| `updated_at` | `timestamptz` | NO | |

### `public.project_runs`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `text` | NO | Client-generated UUID |
| `project_id` | `text` | NO | FK → `projects.id` CASCADE |
| `count_p0` | `int` | NO | |
| `count_p1` | `int` | NO | |
| `count_p2` | `int` | NO | |
| `count_total` | `int` | NO | |
| `analysis_framework` | `text` | YES | Framework snapshot at run time |
| `analysis_router` | `text` | YES | Router snapshot (`app|pages|unknown`) |
| `analysis_routes_json` | `jsonb` | NO | Route details for the run (`path`, `purpose`, `criticality`) |
| `meta_json` | `jsonb` | NO | Run metadata (`scope`, `selectedRoutePaths`, progress/status fields, analysis snapshot) |
| `created_at` | `timestamptz` | NO | |

### `public.run_issues`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `bigserial` | NO | |
| `run_id` | `text` | NO | FK → `project_runs.id` CASCADE |
| `project_id` | `text` | NO | Denormalized for fast queries |
| `issue_id` | `text` | NO | Client issue ID |
| `source` | `text` | NO | `'github'` or `'browser'` |
| `title` | `text` | NO | |
| `priority` | `text` | NO | `'P0'`, `'P1'`, or `'P2'` |
| `category` | `text` | NO | |
| `description` | `text` | YES | |
| `card_json` | `jsonb` | YES | Full structured card payload |
| `file_path` | `text` | YES | Related source file path |
| `endpoint` | `text` | YES | Related endpoint/route |
| `confidence` | `text` | YES | Confidence marker |
| `state` | `text` | YES | Issue lifecycle state |

All three tables have RLS enabled. The service-role key used server-side bypasses RLS.

## 6. Supabase Storage Artifacts
Bucket: `qa-project-artifacts` (or `SUPABASE_STORAGE_BUCKET`).

### Scan artifacts
- `pipeline/scans/<scanId>/standards_scorecard.json`
- `pipeline/scans/<scanId>/browser_use_test_plan.json`
- `pipeline/scans/<scanId>/ai_report.md`
- `pipeline/scans/<scanId>/scan_state.json`

### Run artifacts
- `pipeline/runs/<runId>/run_state.json`
- `pipeline/runs/<runId>/browser_use_request.json`
- `pipeline/runs/<runId>/browser_use_findings.json` (when review completes)

## 7. Static Scanner Behavior
Scanner is static and safe (no user code execution).

Current scanner capabilities:
- Detect Next.js router mode (`app` vs `pages` vs `unknown`)
- Enumerate API endpoints from:
  - `app/api/**/route.ts|js`
  - `pages/api/**.ts|js`
- Inspect package dependencies for stack signals
- Pattern checks for:
  - response contract/status usage
  - validation usage
  - auth/authz signals
  - rate limiting signals
  - idempotency signals
  - timeout/retry signals
  - requestId/logging signals
  - pagination + max-limit signals

## 7.1 Project Analysis Data (Framework + Routes)
Project analysis is now treated as a first-class run input/output:

- At project creation (`/projects/new`), GitHub projects trigger an analysis scan.
- On run page, analysis can be run separately via a dedicated "Scan" action.
- If analysis is missing, run page auto-triggers analysis.
- Normal run refreshes analysis as part of the run workflow.
- Analysis UI renders:
  - framework label with framework brand icon (when recognized)
  - router type
  - analyzed route tree with per-route purpose text
- Rerun can target only analyzed pages using route scope selector.

Route purpose text is normalized to be more specific (e.g. auth entry, project list, detail page flows), and those purposes are persisted per run in `project_runs.analysis_routes_json`.

## 8. AI Integration
AI report generation is server-side only (`lib/ai.ts`).
Inputs are constrained to scanner outputs (summary, endpoints, checks, stack, UI routes), not whole repository source dumps.

Outputs are written as markdown artifact and used to enrich planning guidance.

## 9. Browser-use Contracts
### Generated requirement payload (`browser_use_test_plan.json`)
```json
{
  "project": { "name": "", "framework": "nextjs", "baseUrl": "", "notes": "" },
  "standards": ["Contract", "Validation", "Auth", "RateLimit", "Idempotency", "Pagination", "UX"],
  "routes": [
    {
      "path": "/",
      "purpose": "",
      "criticality": "high|medium|low",
      "tests": [
        { "id": "", "category": "", "goal": "", "steps": ["..."], "expected": "", "severity_if_fail": "P0|P1|P2" }
      ]
    }
  ]
}
```

### Expected browser findings schema
```json
{
  "run": { "baseUrl": "", "timestamp": "", "deviceProfiles": ["desktop", "mobile"] },
  "findings": [
    {
      "testId": "",
      "path": "",
      "result": "pass|fail|blocked",
      "severity": "P0|P1|P2",
      "observed": "",
      "expected": "",
      "reproSteps": ["..."],
      "evidence": { "url": "", "notes": "", "screenshot": "optional-id" }
    }
  ],
  "summary": { "pass": 0, "fail": 0, "blocked": 0 }
}
```

## 10. Unified Issues Response Contract
`GET /api/issues?runId=<RUN-ID>` returns:

```json
{
  "report": {
    "id": "RUN-20260228-001",
    "project": { "name": "my-app", "framework": "nextjs" },
    "generated_at": "2026-02-28T00:00:00Z",
    "summary": { "score": 72, "p0": 2, "p1": 5, "p2": 7 }
  },
  "cards": [
    { "...ImproveCard": "..." }
  ],
  "remote": {
    "status": "queued|running|completed|failed|disabled",
    "error": null
  }
}
```

Card ordering is deterministic:
1. local findings (`source: "local"`)
2. nextjs-api/browser findings (`source: "nextjs-api"`)

`ImproveCard` type is defined in `lib/pipeline/service.ts`. Legacy audit schemas (separate auditing domain) live in `lib/contracts.ts`.

## 11. GitHub OAuth Flow Details
1. User clicks connect in repo picker.
2. Supabase OAuth starts with scopes: `read:user user:email repo`.
3. Callback route exchanges code/session.
4. `provider_token` is stored in `sessionStorage` under `github_provider_token`.
5. Repo picker calls `/api/github/repos` with `x-github-token`.

## 12. Local Run Checklist
1. `pnpm install`
2. Copy `.env.local.example` → `.env.local` and fill in variables from Section 4
3. Apply SQL migrations in Supabase (or `supabase db push`) including:
   - `supabase/migrations/20260228_runs_issues_tables.sql`
   - `supabase/migrations/20260228_project_runs_meta_json.sql`
   - `supabase/migrations/20260228_project_runs_analysis_columns.sql`
4. `pnpm db:setup` (runs `scripts/setup-db.ts` to verify schema availability)
5. `pnpm dev`
6. Open `http://localhost:3000/projects/new`
7. Connect GitHub and select repository or paste GitHub URL
8. Start pipeline via API integration (`POST /api/pipeline/scans/github` → `POST /api/pipeline/reviews`)
9. Open `/issues?runId=<RUN-ID>` to view merged findings

### Useful scripts
| Command | Purpose |
|---------|--------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint (Next.js config) |
| `pnpm db:setup` | Verify Supabase DB schema connectivity/readiness |

---

## 13. Known Improve Cards

Active `ImproveCard` findings tracked against this project.

---

### IC-0001 — Add max limit to list endpoints to prevent huge payloads

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Category** | Pagination |
| **Standard refs** | API Data Limits (internal) |
| **Effort** | S |
| **Confidence** | high |
| **Owner** | backend |
| **Status** | open |
| **Created** | 2026-02-28T00:00:00Z |

**Scope**
- Endpoint: `GET /api/items`
- File: `app/api/items/route.ts` (lines 1–120)

**Impact**
- *User:* Large lists can load slowly or crash the UI on weaker devices.
- *Business:* Higher infra cost, slower experience, increased error rate.
- *Risk:* Potential DoS vector if endpoints return unbounded data.

**Problem**
List endpoint accepts `limit` but does not enforce an upper bound.

```ts
// app/api/items/route.ts  lines 42–57
const limit = Number(searchParams.get('limit') ?? 1000);
// no max cap
const items = await db.item.findMany({ take: limit });
```

**Recommendation**
Enforce a max limit (e.g., 100) and default to a safe value (e.g., 20).

Implementation steps:
1. Parse `limit` from query params with validation.
2. Clamp `limit` to `MAX_LIMIT`.
3. Return pagination metadata (`nextCursor` or page info).

Acceptance criteria:
- `GET /api/items?limit=999` returns at most `MAX_LIMIT` items.
- Response includes pagination metadata (`meta.nextCursor` or `meta.page`).
- Invalid `limit` values return a `400` with field-level error details.

**Education**
> *Why it matters:* Unbounded list endpoints hurt performance and reliability, and can be abused.
> *Rule of thumb:* Every list endpoint must have a default limit and a hard maximum.
