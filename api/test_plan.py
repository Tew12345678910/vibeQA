"""
Build TestPlan from AuditRequest: routes and test cases (usability, a11y, responsive, performance, security).
"""
from typing import List

from .schemas import AuditRequest, ProjectInfo, RoutePlan, TestCase, TestPlan


def tests_for_route(path: str, path_slug: str) -> List[TestCase]:
    """Build test cases for one route."""
    base = path_slug or "root"
    return [
        TestCase(
            id=f"{base}-USABILITY-NAV",
            category="Usability",
            heuristic="Navigation and wayfinding",
            goal="User can understand where they are and move to key areas",
            steps=[f"Open {path}", "Identify main nav/header", "Check links are visible and labeled", "Verify current page is indicated"],
            expected="Clear navigation; current location visible; main links work.",
            severity_if_fail="P1",
        ),
        TestCase(
            id=f"{base}-USABILITY-FORMS",
            category="Usability",
            heuristic="Forms and inputs",
            goal="Forms are usable and give feedback",
            steps=[f"Open {path}", "Find any forms or inputs", "Check labels and placeholders", "Verify submit/validation feedback"],
            expected="Forms have labels; validation or loading state is visible; no dead submit.",
            severity_if_fail="P2",
        ),
        TestCase(
            id=f"{base}-USABILITY-STATES",
            category="Usability",
            heuristic="Empty and error states",
            goal="Empty/error states are handled",
            steps=[f"Open {path}", "Look for empty lists or error messages", "Check loading or skeleton states if present"],
            expected="Empty/error/loading states are present where needed; no raw errors or blank screens.",
            severity_if_fail="P2",
        ),
        TestCase(
            id=f"{base}-A11Y-LABELS",
            category="Accessibility",
            heuristic="Labels and semantics",
            goal="Interactive elements have accessible names",
            steps=[f"Open {path}", "Inspect buttons/links/images", "Check for text, aria-label, or alt"],
            expected="Buttons and links have visible or accessible names; images have alt where meaningful.",
            severity_if_fail="P1",
        ),
        TestCase(
            id=f"{base}-A11Y-FOCUS",
            category="Accessibility",
            heuristic="Focus and keyboard",
            goal="Focus order and keyboard use are reasonable",
            steps=[f"Open {path}", "Tab through interactive elements", "Check focus is visible and order is logical"],
            expected="Focus visible; tab order follows layout; no focus traps.",
            severity_if_fail="P2",
        ),
        TestCase(
            id=f"{base}-RESP-DESKTOP",
            category="Responsive",
            heuristic="Desktop viewport",
            goal="Layout works at desktop width",
            steps=[f"Open {path} at 1440px width", "Check content fits and is readable", "No horizontal scroll unless intended"],
            expected="Readable layout; no unnecessary horizontal scroll; CTAs visible.",
            severity_if_fail="P1",
        ),
        TestCase(
            id=f"{base}-RESP-MOBILE",
            category="Responsive",
            heuristic="Mobile viewport",
            goal="Layout works at mobile width",
            steps=[f"Open {path} at 390px width", "Check tap targets and text size", "Verify nav/forms usable"],
            expected="Content stacks; tap targets ≥44px; text readable without zoom.",
            severity_if_fail="P1",
        ),
        TestCase(
            id=f"{base}-PERF-LOAD",
            category="Performance",
            heuristic="Load and responsiveness",
            goal="Page loads and feels responsive",
            steps=[f"Open {path}", "Note time to first content", "Check for long spinners or blank screen", "Scroll and interact briefly"],
            expected="Content appears within a few seconds; no long blank screen; interactions respond.",
            severity_if_fail="P2",
        ),
        TestCase(
            id=f"{base}-PERF-ASSETS",
            category="Performance",
            heuristic="Images and assets",
            goal="No obvious broken or oversized assets",
            steps=[f"Open {path}", "Check images load", "Look for broken image icons or console errors", "Note any very large images"],
            expected="Images load or have placeholders; no broken asset icons; no severe console errors.",
            severity_if_fail="P2",
        ),
        TestCase(
            id=f"{base}-SECURE-HTTPS",
            category="Security",
            heuristic="HTTPS and mixed content",
            goal="Page is served over HTTPS without mixed content",
            steps=[f"Open {path}", "Confirm URL is https", "Check console for mixed-content warnings", "Verify no insecure requests"],
            expected="Page on HTTPS; no mixed content blocking; no insecure resource warnings.",
            severity_if_fail="P0",
        ),
        TestCase(
            id=f"{base}-CACHE-HEADERS",
            category="Performance",
            heuristic="Caching",
            goal="Static assets have reasonable cache headers",
            steps=[f"Open {path}", "Open devtools Network", "Reload and check cache headers on main doc and assets", "Note if cache-control present"],
            expected="HTML or key assets have cache-control or etag; no obvious no-store on everything.",
            severity_if_fail="P2",
        ),
        TestCase(
            id=f"{base}-404-HANDLING",
            category="Usability",
            heuristic="404 and error pages",
            goal="Non-existent path shows a proper 404 or error page",
            steps=[f"Open {path}/nonexistent-page-404-test", "Check HTTP status or page content", "Verify user sees message, not raw server error"],
            expected="404 or custom error page; user-friendly message; option to go back or home.",
            severity_if_fail="P2",
        ),
    ]


def build_test_plan(request: AuditRequest) -> TestPlan:
    """Build a TestPlan from an AuditRequest."""
    project = ProjectInfo(
        name="Autogenerated plan",
        framework="nextjs",
        baseUrl=request.baseUrl,
        notes="Checks: usability (nav/forms/states), accessibility MVP, responsiveness, performance, HTTPS/caching/404.",
    )
    routes: List[RoutePlan] = []
    for raw_path in (request.routes or ["/"]):
        path = raw_path or "/"
        if not path.startswith("/"):
            path = f"/{path}"
        path_slug = path.replace("/", "_").strip("_") or "root"
        tests = tests_for_route(path, path_slug)
        routes.append(
            RoutePlan(
                path=path,
                purpose="Landing page" if path == "/" else "Content page",
                criticality="high" if path in ("/", "/checkout") else "medium",
                tests=tests,
            )
        )
    return TestPlan(
        project=project,
        standards=["Nielsen", "WCAG2.2_AA", "Performance", "Responsive", "HTTPS"],
        routes=routes,
    )
