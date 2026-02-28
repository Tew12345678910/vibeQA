#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
python -m playwright install chromium

pushd sample_project/ui >/dev/null
python -m http.server 4173 >/tmp/qateam_demo_server.log 2>&1 &
SERVER_PID=$!
popd >/dev/null

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

python -m qa_agentic_team.cli \
  --config configs/sample_run.json \
  --guideline guides/human_guideline.txt \
  --output output

printf "\nReport: %s\n" "$ROOT_DIR/output/qa_report.md"
