"""
Build CloudAuditResponse: merge reviewer into issues, build artifacts and summary.
"""
from typing import Any, Dict, List, Optional

from .schemas import (
    AuditSummary,
    BacklogItem,
    CloudAuditResponse,
    FindingsPayload,
    IssueItem,
    PageResultItem,
    ReviewerReport,
)


def merge_reviewer_into_issues(
    findings: FindingsPayload,
    reviewer: Optional[ReviewerReport],
) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    backlog_by_test_id: Dict[str, BacklogItem] = {}
    if reviewer:
        for item in reviewer.backlog:
            if item.test_id:
                backlog_by_test_id[item.test_id] = item
            elif item.issue_title:
                backlog_by_test_id[item.issue_title] = item
    for finding in findings.findings:
        if finding.result == "pass":
            continue
        bl = backlog_by_test_id.get(finding.testId) or backlog_by_test_id.get(finding.expected[:50])
        severity = "high" if finding.severity == "P0" else "medium"
        impact = "Stub impact; run with BEDROCK_REVIEWER_ENABLED=1 for enriched report."
        fix = "Stub fix; run with BEDROCK_REVIEWER_ENABLED=1 for enriched report."
        if bl:
            severity = "high" if bl.priority == "P0" else "medium" if bl.priority == "P1" else "low"
            impact = bl.user_impact or impact
            fix = bl.recommended_fix or fix
        issues.append({
            "severity": severity,
            "category": "usability",
            "title": finding.testId,
            "symptom": finding.observed,
            "reproSteps": finding.reproSteps,
            "expected": finding.expected,
            "actual": finding.observed,
            "impact": impact,
            "recommendedFixApproach": fix,
            "verificationSteps": finding.reproSteps,
            "evidenceLinks": [str(finding.evidence.url)],
        })
    return issues


def build_artifacts(
    findings: FindingsPayload,
    reviewer: Optional[ReviewerReport],
) -> List[Dict[str, Any]]:
    artifacts: List[Dict[str, Any]] = []
    if not reviewer:
        return artifacts
    base = str(findings.run.baseUrl)
    for note in reviewer.education:
        artifacts.append({
            "kind": "education",
            "url": base,
            "meta": {"principle": note.principle, "guideline": note.guideline, "standard_ref": note.standard_ref},
        })
    for item in reviewer.pages_to_add:
        artifacts.append({
            "kind": "page_to_add",
            "url": base,
            "meta": {"type": item.type, "description": item.description, "suggested_routes": item.suggested_routes},
        })
    return artifacts


def build_audit_response(
    findings: FindingsPayload,
    reviewer: Optional[ReviewerReport],
    run_mode: str,
) -> CloudAuditResponse:
    # One page result per (route, viewport), not per finding
    by_route: dict = {}
    for finding in findings.findings:
        key = (finding.path, "desktop")
        if key not in by_route:
            by_route[key] = []
        by_route[key].append(finding)

    page_results: List[PageResultItem] = []
    for (route, viewport_key), route_findings in by_route.items():
        any_fail_or_blocked = any(f.result in ("fail", "blocked") for f in route_findings)
        # Short summary note; avoid dumping raw agent thinking/JSON into every finding
        summary_parts = [f"{f.testId}: {f.result}" for f in route_findings[:5]]
        if len(route_findings) > 5:
            summary_parts.append(f"... and {len(route_findings) - 5} more")
        first_url = str(route_findings[0].evidence.url) if route_findings else ""
        notes = [", ".join(summary_parts)]
        page_results.append(PageResultItem(
            route=route,
            fullUrl=first_url,
            viewportKey=viewport_key,
            status="error" if any_fail_or_blocked else "ok",
            title="",
            signals={},
            evidence={"screenshots": [], "notes": notes},
        ))
    issues_raw = merge_reviewer_into_issues(findings, reviewer)
    issues = [IssueItem(**i) for i in issues_raw]
    artifacts = build_artifacts(findings, reviewer)
    key_findings: List[str] = []
    if reviewer and reviewer.executive_summary:
        key_findings = reviewer.executive_summary[:6]
    return CloudAuditResponse(
        status="completed",
        runMode=run_mode,
        pageResults=page_results,
        issues=issues,
        artifacts=artifacts,
        summary=AuditSummary(
            pagesAudited=len(page_results),
            passCount=findings.summary.pass_,
            failCount=findings.summary.fail,
            highRiskCount=sum(1 for i in issues_raw if i.get("severity") == "high"),
            keyFindings=key_findings,
        ),
    )
