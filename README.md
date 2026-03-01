# VibeQA

VibeQA helps developers catch quality issues that AI coding tools miss ([tryvibeqa.vercel.app](https://tryvibeqa.vercel.app)). AI can write code quickly, but it often skips important details like security checks, error handling, and user experience polish. VibeQA scans your repos and tests your app in a real browser, then gives you clear, actionable feedback with fixes.

## Problem

AI coding tools generate code quickly, but often miss production-quality requirements:

**Code Quality & Security Gaps:**
- Missing input validation and rate limiting
- Weak permission checks
- Inconsistent error handling
- Poor observability (no request IDs, insufficient logging)
- API endpoints without pagination limits

**User Experience Gaps (only visible in a browser):**
- Inaccessible elements
- Broken mobile layouts
- Forms with no feedback
- Confusing page flows
- Elements that don't work across different screen sizes

**Common High-Priority Issues:**
- `P0 Security/Auth`: Login endpoints without rate limiting
- `P0 Security/CSRF`: State-changing routes accepting untrusted origins
- `P1 Validation`: Request bodies used without schema parsing
- `P1 Accessibility`: Missing alt text and weak interaction semantics
- `P2 API Design`: Unbounded list endpoints

These patterns appear frequently in AI-generated projects and create "works on my machine" code that fails in production. We have more than 100+ Issues data set to identify all possible failure points.

## Solution

VibeQA combines static code analysis with live browser testing to catch issues before they reach production:

**Static Code Scanning:**
1. Analyzes GitHub repositories to detect framework, router, and routes
2. Evaluates code against 100+ quality rules using RAG (Retrieval-Augmented Generation)
3. Identifies security, reliability, validation, and observability gaps

**Live Browser Testing:**
1. Tests the running application in multiple screen sizes and orientations
2. Uses AI agents (AWS Bedrock + Browser Use) to explore pages and interactions
3. Detects UX issues, accessibility problems, and runtime errors

**Educational Issue Cards:**
Each finding includes:
- Priority level (`P0`, `P1`, `P2`) and category
- Impact on users and business
- File/line evidence or browser observation
- Step-by-step fix instructions
- Acceptance criteria
- "Rule of thumb" to avoid similar issues

This "issue → explanation → fix → principle" approach helps developers learn repeatable patterns for production-quality code.

## Target Users

**Primary:**
- Developers using AI coding assistants (Cursor, GitHub Copilot, etc.)
- Teams building MVPs or prototypes rapidly with AI
- Solo developers shipping side projects

**Secondary:**
- Engineering managers reviewing AI-generated code
- Educators teaching modern development practices
- Open-source maintainers reviewing contributor code

## Team Members and Roles

- **Mathus** - Frontend Development & UI/UX
- **Le** - AI/ML Integration & Browser Automation
- **Phuong** - RAG Integration

## Setup Instructions

### Prerequisites

- Node.js 20+
- pnpm 10+
- Python 3.11+
- Supabase account
- OpenAI API key (or compatible AI provider)
- AWS account with Bedrock access (for browser testing)

### Environment Configuration

**Web App (`qa-web/.env.local`):**

Required:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SECRET_KEY=your_service_role_key
AI_API_KEY=your_openai_api_key
```

Optional:
```env
AI_BASE_URL=https://api.openai.com/v1
AI_CHAT_MODEL=gpt-4o-mini
AI_EMBEDDING_MODEL=text-embedding-3-small
SUPABASE_STORAGE_BUCKET=qa-project-artifacts
BROWSER_USE_SERVER_BASE_URL=http://localhost:8001
CLOUD_BROWSER_API_BASE_URL=your_browser_api_url
CLOUD_BROWSER_API_KEY=your_browser_api_key
```

**Browser Agent API (root `.env`):**

```env
AGENTCORE_BROWSER_REGION=us-west-2
BEDROCK_MODEL_ID=us.amazon.nova-pro-v1:0
AGENTCORE_BROWSER_ID=
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
```

### Installation

**1. Install Web App:**
```bash
cd qa-web
pnpm install
```

**2. Install Python API:**
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**3. Initialize Database & Rules:**
```bash
cd qa-web
pnpm rules:upsert:all
pnpm rules:index
```

### Running Locally

**Start Web App:**
```bash
cd qa-web
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000)

**Start Browser Agent API:**
```bash
# From repo root
python -m uvicorn api.cloud_api:app --reload --host 0.0.0.0 --port 8001
```

### Usage Flow

1. Log in with GitHub
2. Select a repository to scan
3. Review the static code analysis results
4. (Optional) Run browser-based testing on your hosted app
5. Review unified findings with priority rankings
6. Implement fixes using the step-by-step guidance

## Tech Stack

### Frontend & Web Backend
- **Next.js 16** (App Router) - Full-stack React framework
- **React 19** - UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS v4** - Styling
- **shadcn/ui** - Component library (Radix UI primitives)
- **better-auth** - Authentication with GitHub OAuth

### Backend & APIs
- **FastAPI** (Python) - Browser agent API server
- **OpenAI API** - Issue generation and embeddings (`gpt-4o-mini`, `text-embedding-3-small`)
- **AWS Bedrock AgentCore (Browser Use Tool)** - AI agent orchestration (model: `us.amazon.nova-pro-v1:0`)

### Database & Storage
- **Supabase**
  - PostgreSQL database for projects, runs, issues, rules
  - `pgvector` extension for RAG embeddings
  - Storage buckets for scan artifacts and reports

**Key Tables:**
- `projects` - User repositories
- `project_runs` - Scan execution history
- `run_issues` - Findings with evidence
- `rules` - Quality standards (100+ patterns)
- `control_chunks` - Rule embeddings for RAG retrieval
- `code_chunks` - Repository code embeddings

### Validation & Schemas
- **Zod v4** - Runtime type validation for API contracts

### Key Integrations

**1. GitHub API**
- OAuth for user authentication
- Repository access and file tree fetching
- Used in: `lib/project-auditor/ingest.ts`, `app/api/github/`

**2. OpenAI API** (`lib/ai.ts`, `lib/ai/openai.ts`)
- Generate issue cards from findings
- Create embeddings for RAG retrieval
- Models: `gpt-4o-mini` (chat), `text-embedding-3-small` (embeddings)

**3. AWS Bedrock Agent** (`api/browser_service.py`, `api/cloud_api.py`)
- Orchestrates browser automation with LLM reasoning
- Model: `us.amazon.nova-pro-v1:0`
- Tests routes in multiple screen sizes and orientations

**4. Browser Use** (`api/browser_service.py`)
- Python library for browser automation
- Explores pages, interacts with elements, captures screenshots
- Returns structured findings (good points, problems)

**5. Supabase Services**
- **Auth**: GitHub OAuth integration
- **Database**: PostgreSQL with `pgvector` for semantic search
- **Storage**: Stores scan states, reports, test plans
- Used in: `lib/db/`, `lib/cloud/`, `lib/supabase/`

### Pipeline Architecture

```
[GitHub Repo] 
    ↓
[Static Scanner] → StandardsScorecard + TestPlan
    ↓
[RAG Retrieval] → Match against 100+ rules
    ↓
[OpenAI] → Generate educational issue cards
    ↓
[Supabase] → Store findings
    ↓
[Browser Agent API] → AWS Bedrock + Browser Use
    ↓
[Web App] → Unified report with priorities
```

### Repository Structure
- `qa-web/` - Next.js app (UI + API routes)
- `api/` - FastAPI browser agent service
- `qa-web/supabase/migrations/` - Database schema
- `qa-web/lib/pipeline/` - Core scanning logic
- `qa-web/lib/project-auditor/` - Static analysis rules
- `qa-web/components/browserqa/` - UI components
