# BrowserQA Unified Pipeline — Project Configuration, API, and Features

Last verified against codebase: 2026-02-28.

## 1. Product Scope
This project now runs a single GitHub-first project creation pipeline:

1. Source scan from GitHub repository (`My Repositories` picker or GitHub URL)
2. Run static scanner + AI codebase analysis
3. Show scan result to user
4. User confirms project by entering a public HTTPS URL
5. Redirect immediately to Issues result page
6. Show findings one-by-one with ordering:
   - local static scan findings first
   - nextjs-api/browser review findings second

ZIP file upload is removed from the Create New Project flow.

No legacy Project Auditor compatibility routes are part of this pipeline.

## 2. Main User Routes
- `/projects/new` — unified GitHub source scan + confirm flow
- `/auth/github-callback` — GitHub OAuth callback for repository access
- `/issues?runId=<RUN-ID>` — issue result page for a run
- `/` and `/dashboard` redirect to `/projects/new`

## 3. Required Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (optional, default: `qa-project-artifacts`)
- `OPENAI_API_KEY` (optional fallback supported)
- `OPENAI_MODEL` (optional; default `gpt-4.1-mini`)
- `BROWSER_USE_SERVER_BASE_URL` (optional; if missing, remote review is marked disabled)
- `BROWSER_USE_SERVER_API_KEY` (optional)

## 4. GitHub Source Intake Flow
1. User opens `/projects/new` and selects `My Repositories`.
2. If no token is present, the UI starts Supabase GitHub OAuth with scopes:
   - `read:user`
   - `user:email`
   - `repo`
3. OAuth callback stores `github_provider_token` in `sessionStorage`.
4. UI calls `GET /api/github/repos` with `x-github-token` to list accessible repositories (including private repos).
5. User selects a repository (or provides a GitHub URL manually).
6. UI calls `POST /api/pipeline/scans/github` with:
   - `repoUrl`
   - `projectName` (optional)
7. Backend resolves repository tree via GitHub REST API and fetches text blobs file-by-file for static scan.

## 5. Storage (Supabase)
All pipeline artifacts are stored in Supabase Storage bucket `qa-project-artifacts` (or `SUPABASE_STORAGE_BUCKET`).
Repository files are read from GitHub REST API in-memory and are not persisted to Supabase.

### Scan paths
- `pipeline/scans/<scanId>/standards_scorecard.json`
- `pipeline/scans/<scanId>/browser_use_test_plan.json`
- `pipeline/scans/<scanId>/ai_report.md`
- `pipeline/scans/<scanId>/scan_state.json`

### Run paths
- `pipeline/runs/<runId>/run_state.json`
- `pipeline/runs/<runId>/browser_use_request.json`
- `pipeline/runs/<runId>/browser_use_findings.json` (when remote review completes)

## 6. Scanner Engine (Static + Safe)
Scanner is static-only and does not execute user code.

Implemented checks include:
- Detect Next.js App Router vs Pages Router
- Enumerate endpoints from:
  - `app/api/**/route.ts|js`
  - `pages/api/**.ts|js`
- Dependency inspection from `package.json`
- Pattern scan (regex fallback) for:
  - response contract/status usage
  - validation usage (`zod`, `joi`, etc.)
  - auth guards and ownership checks
  - rate limit existence + route application
  - idempotency key + storage signal
  - timeouts/retries wrappers
  - requestId logging
  - pagination params + max-limit signals

## 7. AI Codebase Analysis
After static scan, an AI report is generated from scanned evidence (endpoints, checks, stack signals, UI routes).

- Output artifact: `pipeline/scans/<scanId>/ai_report.md`
- If `OPENAI_API_KEY` is missing or model call fails, fallback markdown is generated so pipeline still completes.

## 8. Browser Use Requirement Payload
`browser_use_test_plan.json` is generated from scan output and sent to Browser Use server when the project is confirmed.

Shape:
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

## 9. Browser Use Findings Contract
Remote findings use this schema:

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

## 10. Unified Issues API Response
Fetch-all-issues response format:

```json
{
  "report": {
    "id": "RUN-20260228-001",
    "project": { "name": "my-app", "framework": "nextjs" },
    "generated_at": "2026-02-28T00:00:00Z",
    "summary": {
      "score": 72,
      "p0": 2,
      "p1": 5,
      "p2": 7
    }
  },
  "cards": [
    { "...ImproveCard": "..." }
  ]
}
```

Cards are always sorted as:
1. `source: "local"`
2. `source: "nextjs-api"`

## 11. Active API Endpoints (Pipeline + GitHub Source)
- `GET /api/github/repos` (requires `x-github-token`)
- `POST /api/pipeline/scans/github`
- `GET /api/pipeline/scans/:scanId`
- `POST /api/pipeline/reviews`
- `GET /api/pipeline/issues/:runId`
- `GET /api/issues?runId=<RUN-ID>` (fetch-all-issues contract)

## 12. Local Run Checklist
1. `pnpm install`
2. Set required env vars in `.env.local`
3. `pnpm dev`
4. Open `http://localhost:3000/projects/new`
5. Connect GitHub, select repository, run scan, confirm URL, verify redirect to `/issues?runId=...`
