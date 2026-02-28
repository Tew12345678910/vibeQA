"""
Audit routes: POST /audits, GET /audits/{run_id}, POST /audits/{run_id}/cancel.
"""
import asyncio
import os
import uuid
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ..schemas import AuditRequest, CloudAuditResponse, CloudStartResponse
from ..store import get_run, set_run, has_run
from ..test_plan import build_test_plan
from ..browser_service import (
    run_browser_use_agent,
    stub_findings_from_plan,
    blocked_findings_from_reason,
)
from ..reviewer import run_reviewer_ai
from ..response_builder import build_audit_response

router = APIRouter()


@router.post("", response_model=CloudStartResponse)
async def start_audit(request: AuditRequest) -> CloudStartResponse:
    plan = build_test_plan(request)
    use_agent = bool(os.getenv("BEDROCK_BROWSER_IDENTIFIER"))
    if use_agent:
        loop = asyncio.get_running_loop()
        try:
            findings = await loop.run_in_executor(
                None,
                lambda: run_browser_use_agent(plan, auth=request.auth),
            )
        except Exception as e:
            err = str(e).lower()
            if any(x in err for x in ("could not connect", "failed to resolve", "getaddrinfo", "name resolution", "endpointconnectionerror")):
                findings = blocked_findings_from_reason(
                    plan,
                    "AWS Bedrock unreachable (DNS or network). Check internet, DNS, proxy, and firewall. "
                    "Ensure this machine can resolve and reach bedrock-runtime.*.amazonaws.com.",
                )
            else:
                raise
    else:
        findings = stub_findings_from_plan(plan)

    reviewer = run_reviewer_ai(plan, findings)
    run_id = str(uuid.uuid4())
    set_run(run_id, {"findings": findings, "reviewer": reviewer, "runMode": "agent" if use_agent else "stub"})
    return CloudStartResponse(externalRunId=run_id, status="completed")


@router.get("/{run_id}", response_model=CloudAuditResponse)
async def get_audit(run_id: str) -> CloudAuditResponse:
    entry = get_run(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Run not found")
    payload = entry["findings"]
    reviewer = entry.get("reviewer")
    run_mode = entry.get("runMode", "stub")
    return build_audit_response(payload, reviewer, run_mode)


@router.post("/{run_id}/cancel")
async def cancel_audit(run_id: str) -> Dict[str, Any]:
    if not has_run(run_id):
        raise HTTPException(status_code=404, detail="Run not found")
    return {"ok": True, "status": "canceled"}
