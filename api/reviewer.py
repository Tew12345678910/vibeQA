"""
Reviewer AI: Bedrock model to produce ReviewerReport from findings (no browser tool).
"""
import json
import os
from typing import Optional

from strands import Agent
from strands.models import BedrockModel

from .schemas import FindingsPayload, ReviewerReport, TestPlan

_reviewer_model: Optional[BedrockModel] = None


def get_reviewer_model() -> BedrockModel:
    global _reviewer_model
    if _reviewer_model is not None:
        return _reviewer_model
    region = os.getenv("BEDROCK_REGION", "us-west-2")
    model_id = os.getenv("BEDROCK_REVIEWER_MODEL_ID", "us.amazon.nova-pro-v1:0")
    _reviewer_model = BedrockModel(region_name=region, model_id=model_id)
    return _reviewer_model


REVIEWER_SYSTEM_PROMPT = """
You are a senior UX engineer + staff frontend reviewer.

INPUTS
1) Repo Scanner summary: routes and stack (here: Next.js, Tailwind, the routes from the test plan).
2) Findings JSON from Browser-Use (failures and blocked tests).

OUTPUT REQUIREMENTS
Create a report as valid JSON with exactly these top-level keys:
- executive_summary: array of up to 5 strings (top issues).
- backlog: array of objects, each with: priority ("P0"|"P1"|"P2"), issue_title, test_id (optional), impacted_routes (array), user_impact, standard_violated, recommended_fix, acceptance_criteria (array of strings), why_this_matters (optional), rule_of_thumb (optional).
- pages_to_add: array of objects with: type (e.g. empty_state, error_page, faq), description, suggested_routes (array).
- education: array of objects with: principle, guideline, standard_ref.
- quick_wins: array of strings (≤1 hour each).
- structural_refactors: array of strings (multi-day).

Style: extremely actionable. Assume Tailwind + React/Next.
Return ONLY the JSON object, no markdown or commentary.
"""


def run_reviewer_ai(plan: TestPlan, findings: FindingsPayload) -> Optional[ReviewerReport]:
    """Run Reviewer AI on findings; returns None if disabled or no failures."""
    if os.getenv("BEDROCK_REVIEWER_ENABLED", "").lower() not in ("1", "true", "yes"):
        return None
    failed = [f for f in findings.findings if f.result in ("fail", "blocked")]
    if not failed:
        return None
    model = get_reviewer_model()
    reviewer_agent = Agent(model=model)
    findings_json = findings.model_dump_json(by_alias=True)
    plan_summary = f"Routes: {[r.path for r in plan.routes]}, framework: {plan.project.framework}, baseUrl: {plan.project.baseUrl}"
    prompt = f"{REVIEWER_SYSTEM_PROMPT}\n\nRepo summary: {plan_summary}\n\nFindings JSON:\n{findings_json}"
    response = reviewer_agent(prompt)
    content = (response.message["content"][0]["text"] or "").strip()
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        raw = json.loads(content)
    except json.JSONDecodeError:
        return None
    try:
        return ReviewerReport.model_validate(raw)
    except Exception:
        return None
