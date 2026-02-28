# Agentic UI QA Team Scaffold (Browser-Use Style)

This project scaffolds an AI-friendly UI QA pipeline that can:

1. Read your project code from a target folder.
2. Infer routes and UI expectations from code.
3. Generate test cases automatically.
4. Merge optional human QA guidelines.
5. Execute browser checks.
6. Generate fix-oriented reports for coding agents.

## What it creates

- `qa_agentic_team/` - CLI pipeline modules.
- `configs/sample_run.json` - sample run config.
- `guides/human_guideline.txt` - optional human rule file.
- `sample_project/` - demo code + static UI for validation.
- `output/` - generated reports and screenshots.

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

## Run with human guideline

```bash
python -m qa_agentic_team.cli \
  --config configs/sample_run.json \
  --guideline guides/human_guideline.txt \
  --output output
```

## Run without human guideline

```bash
python -m qa_agentic_team.cli \
  --config configs/sample_run.json \
  --output output_no_guideline
```

## Guideline format

`guides/human_guideline.txt` supports lines:

- `MUST_SEE /path :: text`
- `MUST_NOT_SEE /path :: text`
- `TITLE /path :: title fragment`

## Output for AI coding agents

- `output/qa_report.md` - readable report.
- `output/qa_report.json` - full machine-readable details.
- `output/fix_tasks.json` - focused fix task list with file hints and severity.

## Demo

```bash
./scripts/demo_run.sh
```

This starts a local static server for `sample_project/ui`, runs the QA pipeline, and writes reports to `output/`.

## Next.js QA Platform (Browser-Use Wrapper)

The repository now includes a Next.js-first QA platform under `web/` that wraps the Python analysis/generation pipeline and executes run-cases via Browser-Use.

### Features in v1

- Single workspace, no auth.
- Manual/on-demand runs only.
- Per-suite base URL.
- Desktop + mobile viewport matrix by default.
- SQLite persistence (`data/qa.db`) with Drizzle ORM.
- Report export files in `output/runs/<runId>/`.

### Setup

```bash
cd web
npm install
cp .env.example .env.local
npm run migrate
npm run dev
```

Open `http://localhost:3000`.

### Environment variables

- `BROWSER_USE_BASE_URL`: Browser-Use API endpoint (self-hosted required for localhost/private targets).
- `BROWSER_USE_API_KEY`: Browser-Use API key.
- `QA_DB_PATH`: SQLite file path (defaults to `../data/qa.db`).

### Main API routes

- `POST /api/suites`
- `GET /api/suites`
- `GET /api/suites/:suiteId`
- `POST /api/suites/:suiteId/sync`
- `POST /api/suites/:suiteId/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/issues`
- `GET /api/runs/:runId/report`
- `POST /api/runs/:runId/cancel`
