from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional


AssertionType = Literal[
    "url_path_equals",
    "text_present",
    "text_absent",
    "title_contains",
]


@dataclass
class SourceRef:
    file: str
    line: int


@dataclass
class Assertion:
    kind: AssertionType
    value: str
    source: Optional[SourceRef] = None


@dataclass
class TestCase:
    case_id: str
    name: str
    path: str
    assertions: list[Assertion]
    origin: Literal["auto", "guideline"]


@dataclass
class AssertionResult:
    assertion: Assertion
    passed: bool
    actual: str
    message: str


@dataclass
class TestResult:
    case: TestCase
    passed: bool
    assertion_results: list[AssertionResult]
    screenshot_path: str
    error: Optional[str] = None


@dataclass
class FixTask:
    title: str
    issue: str
    severity: Literal["high", "medium", "low"]
    file: str
    line: int
    recommendation: str
    test_case_id: str


@dataclass
class PipelineArtifacts:
    test_cases: list[TestCase] = field(default_factory=list)
    test_results: list[TestResult] = field(default_factory=list)
    fix_tasks: list[FixTask] = field(default_factory=list)
