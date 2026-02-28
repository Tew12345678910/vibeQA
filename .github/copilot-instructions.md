# GitHub Copilot Instructions — hte26 / qa-web

Last updated: 2026-02-28.

## 1. Project Overview

`qa-web` is a **Next.js 16 App Router** application that provides an automated QA pipeline for GitHub repositories.
The pipeline scans a repo statically, generates an AI report and a browser test plan, optionally runs a remote browser-use review, and merges findings into a unified issues view.

**Package manager:** `pnpm@10.30.0`
**Node framework:** Next.js `16.1.6` (App Router only — no `pages/` routes)
**React:** `19.2.3`
**TypeScript:** strict mode
**Styling:** Tailwind CSS v4 + shadcn/ui (Radix-based components in `components/ui/`)
**Auth:** better-auth (`lib/auth.ts`, `lib/auth-client.ts`)
**Database/Storage:** Supabase JS v2 (`lib/db/`, `lib/supabase/`, `lib/cloud/`)
**Validation:** Zod v4 (`lib/project-auditor/schemas.ts`, `lib/contracts.ts`)
**AI:** OpenAI via `lib/ai.ts`

---

## 2. Repository Layout

```
qa-web/
  app/                  # Next.js App Router pages + API routes
    api/                # Server-only route handlers
      auth/[...all]/    # better-auth catch-all
      github/repos/     # GitHub repo listing
      ingest/           # Ingest helpers (github-private)
      issues/           # GET /api/issues?runId=
      pipeline/
        scans/github/   # POST (scan repo)
        scans/zip/      # POST (scan from zip — in progress)
        scans/[scanId]/ # GET  (scan preview)
        reviews/        # POST (start review)
        issues/[runId]/ # GET  (poll issues)
  components/           # React components
    browserqa/          # Feature components for the QA pipeline UI
    ui/                 # shadcn/ui primitives
  lib/                  # Shared server + client logic
    ai.ts               # OpenAI report generation (server-only)
    auth.ts             # better-auth server config
    auth-client.ts      # better-auth browser client
    contracts.ts        # Zod schemas for legacy audit contracts
    pipeline/service.ts # Core pipeline logic (scan, review, issues)
    project-auditor/    # Static scanner, schemas, test-plan, storage
    cloud/              # Supabase storage client + mapper
    db/                 # Supabase DB client + repository
    browserqa/          # Client-side API wrapper + utilities
    reporting/          # Markdown report generators
    utils/urlSafety.ts  # HTTPS URL validator
  supabase/migrations/  # SQL migration files
```

---

## 3. Coding Conventions

### API Route Handlers

- Every route file exports only named HTTP-method functions (`GET`, `POST`, etc.).
- Always return `NextResponse.json(...)`. Never use `Response` directly.
- Use status `201` for successful creation, `202` for accepted async operations, `200` for reads, `400` for validation errors, `404` for not-found.
- Parse dynamic params with `await context.params` (Next 15+ async params).
- Accept optional tokens via both `x-github-token` header and request body — prefer header, fall back to body.

```ts
// Correct pattern
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await someService(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fallback message" },
      { status: 400 },
    );
  }
}
```

### Dynamic Route Params

```ts
type Context = { params: Promise<{ scanId: string }> };
export async function GET(_: Request, context: Context) {
  const { scanId } = await context.params;
}
```

### Zod Validation (v4)

- Define schemas in `lib/project-auditor/schemas.ts` (pipeline domain) or `lib/contracts.ts` (audit domain).
- Use `z.enum(...)` for status literals; `z.object(...)` for structured types.
- Do not use `.parse()` inside route handlers unless you want thrown exceptions — prefer `.safeParse()` and map errors to 400 responses.

### TypeScript

- Prefer explicit `type` over `interface` for data shapes.
- Use `satisfies` instead of `as` when annotating constant arrays/objects.
- No `any` — use `unknown` + type narrowing.
- Server-only modules must **not** import from client-side hooks or browser APIs.

### Path Aliases

Use `@/` alias for all imports within `qa-web/` (maps to `qa-web/`).

```ts
import { scanGithubRepo } from "@/lib/pipeline/service";
```

---

## 4. Pipeline Data Flow

```
POST /api/pipeline/scans/github
  └─ scanGithubRepo()            → ScanState (stored as scan_state.json)
        ├─ fetch repo tree via GitHub API
        ├─ load text files only (binary skipped, size-limited)
        ├─ scanProjectFromFiles() → StandardsScorecard
        ├─ generateBrowserUseTestPlan() → BrowserUseTestPlan
        └─ generateAiReport()    → ai_report.md

GET /api/pipeline/scans/:scanId
  └─ getScanPreview()            → scan summary + localCards

POST /api/pipeline/reviews
  └─ confirmProjectReview()      → RunState (stored as run_state.json)
        ├─ validates baseUrl (must be hosted HTTPS)
        └─ optional: posts to BROWSER_USE_SERVER_BASE_URL

GET /api/pipeline/issues/:runId  (also /api/issues?runId=)
  └─ getIssuesReport()           → { report, cards, remote }
        ├─ polls remote browser-use status
        └─ merges local + remote cards (local first, then nextjs-api)
```

---

## 5. Key Types

Defined in `lib/pipeline/service.ts`:

### `ImproveCard`

```ts
type ImproveCard = {
  id: string;
  source: "local" | "nextjs-api";
  title: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  standard_refs: Array<{ name: string; type: "internal" }>;
  impact: { user: string; business: string; risk: string };
  scope: {
    surfaces: Array<{
      kind: "endpoint" | "route";
      path: string;
      method?: string;
    }>;
    files: Array<{ path: string; line_start: number; line_end: number }>;
  };
  problem: {
    summary: string;
    evidence: Array<{
      type: "code" | "browser";
      path: string;
      line_start: number;
      line_end: number;
      snippet: string;
    }>;
  };
  recommendation: {
    summary: string;
    implementation_steps: string[];
    acceptance_criteria: string[];
    estimated_effort: "S" | "M" | "L";
    confidence: "high" | "medium" | "low";
  };
  education: { why_it_matters: string; rule_of_thumb: string };
  status: {
    state: "open";
    owner: "backend" | "frontend" | "fullstack";
    created_at: string;
    updated_at: string;
  };
};
```

### `RemoteState`

```ts
type ReviewRemoteState = {
  status: "queued" | "running" | "completed" | "failed" | "disabled";
  reviewId: string | null;
  lastCheckedAt: string | null;
  error: string | null;
  findingsPath: string | null;
};
```

---

## 6. Supabase Storage Conventions

Bucket: `qa-project-artifacts` (override via `SUPABASE_STORAGE_BUCKET`).

| Path                                                 | Content                        |
| ---------------------------------------------------- | ------------------------------ |
| `pipeline/scans/<scanId>/scan_state.json`            | Full `ScanState`               |
| `pipeline/scans/<scanId>/standards_scorecard.json`   | `StandardsScorecard`           |
| `pipeline/scans/<scanId>/browser_use_test_plan.json` | `BrowserUseTestPlan`           |
| `pipeline/scans/<scanId>/ai_report.md`               | Markdown AI report             |
| `pipeline/runs/<runId>/run_state.json`               | Full `RunState`                |
| `pipeline/runs/<runId>/browser_use_request.json`     | Payload sent to browser-use    |
| `pipeline/runs/<runId>/browser_use_findings.json`    | Findings when review completes |

Use `lib/cloud/client.ts` for all storage reads/writes. Do not call Supabase Storage directly in route handlers.

---

## 7. Environment Variables

| Variable                        | Required | Notes                                                           |
| ------------------------------- | -------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      |                                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Also accepted as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` |
| `SUPABASE_SECRET_KEY`           | Yes      | Also accepted as `SUPABASE_SERVICE_ROLE_KEY`                    |
| `SUPABASE_STORAGE_BUCKET`       | No       | Default: `qa-project-artifacts`                                 |
| `OPENAI_API_KEY`                | No       | Omitting causes fallback report                                 |
| `OPENAI_MODEL`                  | No       | Default: `gpt-4.1-mini`                                         |
| `BROWSER_USE_SERVER_BASE_URL`   | No       | Remote review disabled when absent                              |
| `BROWSER_USE_SERVER_API_KEY`    | No       | Auth for browser-use server                                     |

---

## 8. Static Scanner Rules

The scanner (`lib/project-auditor/scanner.ts`) is **read-only** — it never executes user code.

Pattern checks cover:

- **Router detection:** `app/` vs `pages/`
- **Endpoint enumeration:** `app/api/**/route.ts|js`, `pages/api/**.ts|js`
- **Stack signals:** package.json `dependencies` + `devDependencies`
- **Standards checks:** response contract, validation, auth/authz, rate limiting, idempotency, timeout/retry, requestId/logging, pagination + max-limit

Adding a new check: add a `ScorecardCheck` entry in `lib/project-auditor/schemas.ts`, implement detection in `scanner.ts`, and add a weight in `constants.ts`.

---

## 9. UI Component Patterns

- Use primitives from `components/ui/` (shadcn/ui wrappers) for all base UI.
- Feature components live in `components/browserqa/` and are named `*Client.tsx` when they are client components (`"use client"`).
- Use `components/AppChrome.tsx` + `components/AppSidebar.tsx` for layout.
- Use `components/browserqa/LoadingStates.tsx` for loading/error states.
- Use `components/browserqa/StatusBadge.tsx` for run/remote status chips.

---

## 10. What Copilot Should Avoid

- Do **not** add `pages/` directory routes — this project uses App Router exclusively.
- Do **not** import server-only modules (`lib/ai.ts`, `lib/db/`, `lib/cloud/`) into client components.
- Do **not** use `fetch` directly in route handlers to call internal API routes — call the service layer (`lib/pipeline/service.ts`) directly.
- Do **not** skip `validateHostedHttpsUrl` when accepting user-supplied URLs for browser-use.
- Do **not** add `console.log` debug statements; use structured error messages in returned `NextResponse.json` payloads.
- Do **not** inline SQL — use the repository pattern in `lib/db/repository.ts`.
- Do **not** store secrets in client-accessible code or `NEXT_PUBLIC_*` variables.
