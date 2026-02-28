"""
Build simple audit response from agent payload.
"""
from .schemas import SimpleAuditPayload, SimpleAuditResponse


def build_simple_audit_response(simple: SimpleAuditPayload, run_mode: str = "agent") -> SimpleAuditResponse:
    """Build the API response from the agent's simple payload."""
    return SimpleAuditResponse(
        status="completed",
        runMode=run_mode,
        routes=simple.routes,
    )
