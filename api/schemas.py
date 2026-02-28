"""
Pydantic models for Test Plan, simple audit output, and Cloud API request/response.
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl, AliasChoices


# --- Test Plan (agent input: baseUrl + routes to visit) ---


class RoutePlan(BaseModel):
    path: str
    purpose: str = ""


class ProjectInfo(BaseModel):
    name: str
    framework: str
    baseUrl: HttpUrl
    notes: str = ""


class TestPlan(BaseModel):
    project: ProjectInfo
    standards: List[str]
    routes: List[RoutePlan]


# --- Simple audit output (agent returns this) ---


class RouteAuditResult(BaseModel):
    """One audited route with its good_points and problems."""
    route: str = Field(..., description="Route path, e.g. / or /about")
    good_points: List[str] = Field(
        default_factory=list,
        description="UI/UX positive findings for this route",
    )
    problems: List[str] = Field(
        default_factory=list,
        description="UI/UX problems for this route",
    )


class SimpleAuditPayload(BaseModel):
    """Agent output: list of audited routes, each with good_points and problems."""
    routes: List[RouteAuditResult] = Field(
        default_factory=list,
        description="Each audited route with its good_points and problems",
    )


# --- Cloud API request/response ---


class AuditRequest(BaseModel):
    baseUrl: HttpUrl
    routes: List[str] = Field(default_factory=lambda: ["/"], description="List of path routes to audit (e.g. ['/', '/about', '/contact']). The agent runs once per route; send all endpoints you want covered.")


class CloudStartResponse(BaseModel):
    externalRunId: str
    status: str


class SimpleAuditResponse(BaseModel):
    """GET /audits/{id} response: list of audited routes with good_points and problems per route."""
    status: str = "completed"
    runMode: str = "agent"
    routes: List[RouteAuditResult] = Field(
        default_factory=list,
        description="Each audited route with its good_points and problems",
    )
