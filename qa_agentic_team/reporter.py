from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from qa_agentic_team.models import FixTask, TestResult


def build_fix_tasks(results: list[TestResult]) -> list[FixTask]:
    tasks: list[FixTask] = []

    for result in results:
        if result.passed:
            continue

        if result.error:
            tasks.append(
                FixTask(
                    title=f"{result.case.case_id}: navigation/runtime failure",
                    issue=result.error,
                    severity="high",
                    file="unknown",
                    line=1,
                    recommendation=(
                        f"Check route '{result.case.path}' is served and JS runtime errors are fixed. "
                        "Start by opening browser console and network panel for missing assets or crashes."
                    ),
                    test_case_id=result.case.case_id,
                )
            )

        for ar in result.assertion_results:
            if ar.passed:
                continue
            source_file = ar.assertion.source.file if ar.assertion.source else "unknown"
            source_line = ar.assertion.source.line if ar.assertion.source else 1

            severity = "medium"
            if ar.assertion.kind == "url_path_equals":
                severity = "high"
            elif ar.assertion.kind == "title_contains":
                severity = "low"

            recommendation = _recommendation_for_assertion(ar.assertion.kind, ar.assertion.value)

            tasks.append(
                FixTask(
                    title=f"{result.case.case_id}: {ar.assertion.kind} failed",
                    issue=f"{ar.message}; actual={ar.actual}",
                    severity=severity,
                    file=source_file,
                    line=source_line,
                    recommendation=recommendation,
                    test_case_id=result.case.case_id,
                )
            )

    return tasks


def _recommendation_for_assertion(kind: str, value: str) -> str:
    if kind == "text_present":
        return (
            f"Ensure expected text '{value}' is rendered. If copy changed intentionally, update test expectations and source-of-truth text together."
        )
    if kind == "text_absent":
        return f"Remove or gate text '{value}' in the UI for this route."
    if kind == "url_path_equals":
        return "Align frontend routing and navigation target for this path."
    if kind == "title_contains":
        return f"Set document/page title to include '{value}' or update requirement if title policy changed."
    return "Investigate mismatch and align code with intended behavior."


def write_reports(
    output_dir: Path,
    analysis: dict,
    test_results: list[TestResult],
    fix_tasks: list[FixTask],
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    json_report = output_dir / "qa_report.json"
    md_report = output_dir / "qa_report.md"
    fix_json = output_dir / "fix_tasks.json"

    pass_count = sum(1 for r in test_results if r.passed)
    fail_count = len(test_results) - pass_count

    json_report.write_text(
        json.dumps(
            {
                "analysis_summary": {
                    "scanned_files": analysis["scanned_files"],
                    "routes_found": sorted(analysis["routes"].keys()),
                    "expected_text_count": len(analysis["expected_text"]),
                    "expected_title_count": len(analysis["expected_titles"]),
                },
                "test_summary": {
                    "total": len(test_results),
                    "passed": pass_count,
                    "failed": fail_count,
                },
                "results": [asdict(r) for r in test_results],
                "fix_tasks": [asdict(t) for t in fix_tasks],
            },
            indent=2,
        )
    )

    fix_json.write_text(json.dumps([asdict(t) for t in fix_tasks], indent=2))
    md_report.write_text(_markdown_report(test_results, fix_tasks, pass_count, fail_count))

    return {
        "json_report": json_report,
        "md_report": md_report,
        "fix_json": fix_json,
    }


def _markdown_report(
    test_results: list[TestResult],
    fix_tasks: list[FixTask],
    pass_count: int,
    fail_count: int,
) -> str:
    lines = [
        "# UI QA Report",
        "",
        f"- Total test cases: {len(test_results)}",
        f"- Passed: {pass_count}",
        f"- Failed: {fail_count}",
        "",
        "## Failing Cases",
        "",
    ]

    failing = [r for r in test_results if not r.passed]
    if not failing:
        lines.append("No failing cases.")
    else:
        for r in failing:
            lines.append(f"### {r.case.case_id} - {r.case.name}")
            lines.append(f"- Path: `{r.case.path}`")
            lines.append(f"- Screenshot: `{r.screenshot_path}`")
            if r.error:
                lines.append(f"- Runtime error: `{r.error}`")
            for ar in r.assertion_results:
                if not ar.passed:
                    lines.append(f"- Assertion failure: `{ar.message}` (actual: `{ar.actual}`)")
            lines.append("")

    lines.append("## AI Coding Agent Fix Tasks")
    lines.append("")
    if not fix_tasks:
        lines.append("No fix tasks generated.")
    else:
        for idx, task in enumerate(fix_tasks, start=1):
            lines.append(f"{idx}. **{task.title}**")
            lines.append(f"   - Severity: `{task.severity}`")
            lines.append(f"   - File hint: `{task.file}:{task.line}`")
            lines.append(f"   - Issue: `{task.issue}`")
            lines.append(f"   - Recommendation: {task.recommendation}")

    return "\n".join(lines) + "\n"
