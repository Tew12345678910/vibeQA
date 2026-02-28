"""
Audit routes: POST /audits, GET /audits/{run_id}, POST /audits/{run_id}/cancel.
"""
import asyncio
import os
import uuid
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ..schemas import AuditRequest, CloudStartResponse, SimpleAuditResponse
from ..store import get_run, set_run, has_run
from ..test_plan import build_test_plan
from ..browser_service import run_browser_use_agent, simple_payload_from_block
from ..response_builder import build_simple_audit_response

router = APIRouter()


@router.post("", response_model=CloudStartResponse)
async def start_audit(request: AuditRequest) -> CloudStartResponse:
    plan = build_test_plan(request)
    use_agent = bool(os.getenv("AGENTCORE_BROWSER_REGION") or os.getenv("BEDROCK_REGION"))
    if use_agent:
        loop = asyncio.get_running_loop()
        try:
            simple = await loop.run_in_executor(
                None,
                lambda: run_browser_use_agent(plan),
            )
        except Exception as e:
            err = str(e).lower()
            if any(x in err for x in ("could not connect", "failed to resolve", "getaddrinfo", "name resolution", "endpointconnectionerror")):
                simple = simple_payload_from_block(
                    plan,
                    "AWS Bedrock unreachable (DNS or network). Check internet, DNS, proxy, and firewall.",
                )
            else:
                raise
    else:
        simple = simple_payload_from_block(
            plan,
            "Set AGENTCORE_BROWSER_REGION (or BEDROCK_REGION) and AWS credentials to run the browser agent.",
        )

    run_id = str(uuid.uuid4())
    set_run(run_id, {"simple": simple, "runMode": "agent" if use_agent else "stub"})
    return CloudStartResponse(externalRunId=run_id, status="completed")


@router.get("/{run_id}", response_model=SimpleAuditResponse)
async def get_audit(run_id: str) -> SimpleAuditResponse:
    entry = get_run(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Run not found")
    simple = entry["simple"]
    run_mode = entry.get("runMode", "agent")
    return build_simple_audit_response(simple, run_mode)


@router.post("/{run_id}/cancel")
async def cancel_audit(run_id: str) -> Dict[str, Any]:
    if not has_run(run_id):
        raise HTTPException(status_code=404, detail="Run not found")
    return {"ok": True, "status": "canceled"}
