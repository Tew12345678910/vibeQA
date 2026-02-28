"""
Pydantic models for Test Plan, Findings, Reviewer report, and Cloud API request/response.
"""
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, HttpUrl


# --- Test Plan / Findings (agent contracts) ---


class TestCase(BaseModel):
    id: str
    category: str
    heuristic: Optional[str] = None
    goal: str
    steps: List[str]
    expected: str
    severity_if_fail: str = Field(..., alias="severity_if_fail")


class RoutePlan(BaseModel):
    path: str
    purpose: str
    criticality: Literal["low", "medium", "high"] = "medium"
    tests: List[TestCase]


class ProjectInfo(BaseModel):
    name: str
    framework: str
    baseUrl: HttpUrl
    notes: str = ""


class TestPlan(BaseModel):
    project: ProjectInfo
    standards: List[str]
    routes: List[RoutePlan]


class FindingEvidence(BaseModel):
    url: HttpUrl
    notes: str = ""
    screenshot: Optional[str] = None


class Finding(BaseModel):
    testId: str
    path: str
    result: Literal["pass", "fail", "blocked"]
    severity: str
    observed: str
    expected: str
    reproSteps: List[str]
    evidence: FindingEvidence


class FindingsSummary(BaseModel):
    pass_: int = Field(0, alias="pass")
    fail: int = 0
    blocked: int = 0


class RunMeta(BaseModel):
    baseUrl: HttpUrl
    timestamp: str
    deviceProfiles: List[str]


class FindingsPayload(BaseModel):
    run: RunMeta
    findings: List[Finding]
    summary: FindingsSummary


# --- Reviewer AI output ---


class BacklogItem(BaseModel):
    priority: Literal["P0", "P1", "P2"]
    issue_title: str
    test_id: Optional[str] = None
    impacted_routes: List[str] = []
    user_impact: str = ""
    standard_violated: str = ""
    recommended_fix: str = ""
    acceptance_criteria: List[str] = []
    why_this_matters: Optional[str] = None
    rule_of_thumb: Optional[str] = None


class PageToAdd(BaseModel):
    type: str
    description: str = ""
    suggested_routes: List[str] = []


class EducationalNote(BaseModel):
    principle: str = ""
    guideline: str = ""
    standard_ref: str = ""


class ReviewerReport(BaseModel):
    executive_summary: List[str] = Field(default_factory=list, max_length=10)
    backlog: List[BacklogItem] = []
    pages_to_add: List[PageToAdd] = []
    education: List[EducationalNote] = []
    quick_wins: List[str] = []
    structural_refactors: List[str] = []


# --- Cloud API (qa-web) request/response ---


class AuthConfig(BaseModel):
    """Login step before running tests. Credentials come from env vars (never send raw passwords in request)."""
    loginUrl: HttpUrl
    usernameEnv: str = Field(..., description="Env var name for username, e.g. AUDIT_LOGIN_USER")
    passwordEnv: str = Field(..., description="Env var name for password, e.g. AUDIT_LOGIN_PASSWORD")


class AuditRequest(BaseModel):
    baseUrl: HttpUrl
    routes: List[str] = []
    viewports: List[Dict[str, Any]] = []
    maxPages: int = 6
    maxClicksPerPage: int = 6
    focus: List[str] = []
    auth: Optional[AuthConfig] = None


class CloudStartResponse(BaseModel):
    externalRunId: str
    status: str


class PageResultItem(BaseModel):
    route: str
    fullUrl: str
    viewportKey: str = "desktop"
    status: str  # "ok" | "error"
    title: str = ""
    signals: Dict[str, Any] = {}
    evidence: Dict[str, Any] = {}


class IssueItem(BaseModel):
    severity: str
    category: str
    title: str
    symptom: str
    reproSteps: List[str]
    expected: str
    actual: str
    impact: str
    recommendedFixApproach: str
    verificationSteps: List[str]
    evidenceLinks: List[str]


class AuditSummary(BaseModel):
    pagesAudited: int
    passCount: int
    failCount: int
    highRiskCount: int
    keyFindings: List[str] = []


class CloudAuditResponse(BaseModel):
    """Full audit result returned by GET /audits/{run_id}."""
    status: str = "completed"
    runMode: str = "stub"  # "agent" | "stub"
    pageResults: List[PageResultItem] = []
    issues: List[IssueItem] = []
    artifacts: List[Dict[str, Any]] = []
    summary: AuditSummary
