"""
Browser-Use agent: run TestPlan and return FindingsPayload (or stub/blocked).
"""
import json
import os
from datetime import datetime, timezone
from typing import List, Optional

from strands import Agent
from strands.models import BedrockModel
from strands_tools.browser import AgentCoreBrowser

from .schemas import (
    AuthConfig,
    Finding,
    FindingEvidence,
    FindingsPayload,
    FindingsSummary,
    RunMeta,
    TestPlan,
)

_browser_agent: Optional[Agent] = None


def get_browser_agent() -> Agent:
    global _browser_agent
    if _browser_agent is not None:
        return _browser_agent
    region = os.getenv("BEDROCK_REGION", "us-west-2")
    model_id = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")
    browser_identifier = os.getenv("BEDROCK_BROWSER_IDENTIFIER")
    if not browser_identifier:
        raise RuntimeError("BEDROCK_BROWSER_IDENTIFIER is required to run the Browser-Use agent")
    browser_tool = AgentCoreBrowser(region=region, identifier=browser_identifier)
    model = BedrockModel(region_name=region, model_id=model_id)
    _browser_agent = Agent(tools=[browser_tool.browser], model=model)
    return _browser_agent


SYSTEM_PROMPT = """
You are a Browser-Use autonomous QA + UX audit agent.

INPUT
You will receive a Test Plan JSON that includes: baseUrl, routes, tests with steps and expectations.

NAVIGATION
- If navigation to a URL times out: retry once. The site may be slow or the first attempt may have failed.
- If the browser tool allows setting a longer timeout (e.g. for page load), use a generous value (e.g. 60000 ms) for slow sites.
- If the page never loads after retry, record that route's tests as blocked with observed="Navigation timed out; site may be slow, down, or unreachable from this network."

TASK
1) For each route, run the tests exactly as written.
2) Use both desktop and mobile viewport if you can; otherwise desktop + narrow window.
3) For every test output a finding object: testId, path, result (pass/fail/blocked), observed vs expected, repro steps, severity (use severity_if_fail from plan), evidence (url, notes, screenshot id if supported).
4) If blocked (login, crash, navigation timeout), record what blocked it and move on.

EFFICIENCY — avoid redundant tool use
- Do NOT repeat the same action (e.g. get_text on links, or the same click) many times. Once you have enough information to decide pass/fail for a test, record that finding and move to the next test.
- Prefer 1–3 tool calls per test when possible: e.g. open page, gather evidence once (one read or one check), then record the finding.
- If you already retrieved link text or page content, do not retrieve it again; use it to evaluate and record the finding, then proceed.

OUTPUT
Return ONLY the Findings JSON object. Do not include <thinking>, markdown, or any text before or after the JSON. The response must be parseable as JSON (starts with { and contains "run", "findings", "summary").
""".strip()


def blocked_findings_from_reason(plan: TestPlan, block_reason: str) -> FindingsPayload:
    findings_list: List[Finding] = []
    for route in plan.routes:
        for test in route.tests:
            findings_list.append(
                Finding(
                    testId=test.id,
                    path=route.path,
                    result="blocked",
                    severity=test.severity_if_fail,
                    observed=block_reason,
                    expected=test.expected,
                    reproSteps=test.steps,
                    evidence=FindingEvidence(
                        url=f"{plan.project.baseUrl}{route.path}",
                        notes=block_reason,
                        screenshot=None,
                    ),
                )
            )
    return FindingsPayload(
        run=RunMeta(
            baseUrl=plan.project.baseUrl,
            timestamp=datetime.now(timezone.utc).isoformat(),
            deviceProfiles=["desktop", "mobile"],
        ),
        findings=findings_list,
        summary=FindingsSummary(pass_=0, fail=0, blocked=len(findings_list)),
    )


def stub_findings_from_plan(plan: TestPlan) -> FindingsPayload:
    findings: List[Finding] = []
    for route in plan.routes:
        for test in route.tests:
            findings.append(
                Finding(
                    testId=test.id,
                    path=route.path,
                    result="pass",
                    severity=test.severity_if_fail,
                    observed="Behavior matched expectations in a static stub run.",
                    expected=test.expected,
                    reproSteps=test.steps,
                    evidence=FindingEvidence(
                        url=f"{plan.project.baseUrl}{route.path}",
                        notes="Stub run. Set BEDROCK_BROWSER_IDENTIFIER in the Cloud API server env and restart to use the real Browser-Use agent.",
                        screenshot=None,
                    ),
                )
            )
    return FindingsPayload(
        run=RunMeta(
            baseUrl=plan.project.baseUrl,
            timestamp=datetime.now(timezone.utc).isoformat(),
            deviceProfiles=["desktop", "mobile"],
        ),
        findings=findings,
        summary=FindingsSummary(pass_=len(findings), fail=0, blocked=0),
    )


def run_browser_use_agent(plan: TestPlan, auth: Optional[AuthConfig] = None) -> FindingsPayload:
    agent = get_browser_agent()
    login_block = ""
    if auth:
        username = os.environ.get(auth.usernameEnv, "").strip()
        password = os.environ.get(auth.passwordEnv, "").strip()
        if username and password:
            login_block = (
                f"\nLOGIN FIRST (required before any tests):\n"
                f"1) Navigate to {auth.loginUrl}.\n"
                f"2) If a modal or overlay appears, click the button/link that closes it (Accept, OK, Close, Got it, etc.).\n"
                f"3) Fill the email/username input and enter: {username}\n"
                f"4) Fill the password input (input[type=password]) and enter: {password}\n"
                f"5) Click the submit button (Sign in / Log in / Submit).\n"
                f"6) Wait until logged in, then run the Test Plan below.\n\n"
            )
        else:
            login_block = f"\nLOGIN REQUIRED but credentials missing. Set env vars {auth.usernameEnv} and {auth.passwordEnv}.\n\n"

    plan_json = plan.model_dump_json(by_alias=True)
    prompt = f"{SYSTEM_PROMPT}\n{login_block}\nTest Plan JSON:\n{plan_json}"
    response = agent(prompt)
    content = (response.message["content"][0]["text"] or "").strip()

    # Agent sometimes returns "<thinking>...</thinking>  { ... json ... }". Extract JSON.
    def extract_json(text: str) -> str:
        text = text.strip()
        # Remove leading <thinking>...</thinking>
        if "<thinking>" in text.lower():
            idx = text.lower().rfind("</thinking>")
            if idx != -1:
                text = text[idx + len("</thinking>"):].strip()
        # Find first { that starts a JSON object (allow optional markdown code fence)
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        start = text.find("{")
        if start != -1:
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        return text[start : i + 1]
        return text

    to_parse = extract_json(content)
    try:
        raw = json.loads(to_parse)
        return FindingsPayload.model_validate(raw)
    except (json.JSONDecodeError, ValueError):
        block_reason = content[:500] if content else "Browser-Use agent did not return valid JSON."
        return blocked_findings_from_reason(plan, block_reason)
