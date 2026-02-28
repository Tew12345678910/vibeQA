# BrowserQA Unified Pipeline — Project Configuration, API, and Features

Last verified against codebase: 2026-02-28.

## 1. Product Scope
This project now runs a single pipeline only:

1. Source scan (`ZIP` or public GitHub URL)
2. Show scan result to user
3. User confirms project by entering a public HTTPS URL
4. Redirect immediately to Issues result page
5. Show findings one-by-one with ordering:
   - local static scan findings first
   - nextjs-api/browser review findings second

No legacy Project Auditor compatibility routes are part of this pipeline.

## 2. Main User Routes
- `/projects/new` — unified source scan + confirm flow
- `/issues?runId=<RUN-ID>` — issue result page for a run
- `/` and `/dashboard` redirect to `/projects/new`

## 3. Required Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (optional, default: `qa-project-artifacts`)
- `OPENAI_API_KEY` (optional fallback supported)
- `OPENAI_MODEL` (optional)
- `BROWSER_USE_SERVER_BASE_URL` (optional; if missing, remote review is marked disabled)
- `BROWSER_USE_SERVER_API_KEY` (optional)

## 4. Storage (Supabase)
All pipeline artifacts are stored in Supabase Storage bucket `qa-project-artifacts` (or `SUPABASE_STORAGE_BUCKET`).

### Scan paths
- `pipeline/scans/<scanId>/source.zip`
- `pipeline/scans/<scanId>/standards_scorecard.json`
- `pipeline/scans/<scanId>/browser_use_test_plan.json`
- `pipeline/scans/<scanId>/ai_report.md`
- `pipeline/scans/<scanId>/scan_state.json`

### Run paths
- `pipeline/runs/<runId>/run_state.json`
- `pipeline/runs/<runId>/browser_use_request.json`
- `pipeline/runs/<runId>/browser_use_findings.json` (when remote review completes)

## 5. Scanner Engine (Static + Safe)
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

## 6. Browser Use Requirement Payload
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

## 7. Browser Use Findings Contract
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

## 8. Unified Issues API Response
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

## 9. Active API Endpoints (Pipeline)
- `POST /api/pipeline/scans/zip`
- `POST /api/pipeline/scans/github`
- `GET /api/pipeline/scans/:scanId`
- `POST /api/pipeline/reviews`
- `GET /api/pipeline/issues/:runId`
- `GET /api/issues?runId=<RUN-ID>` (fetch-all-issues contract)

## 10. Local Run Checklist
1. `pnpm install`
2. Set required env vars in `.env.local`
3. `pnpm dev`
4. Open `http://localhost:3000/projects/new`
5. Scan source, confirm URL, verify redirect to `/issues?runId=...`
