from __future__ import annotations

from qa_agentic_team.models import Assertion, TestCase


def generate_auto_test_cases(analysis: dict, max_text_assertions: int = 20) -> list[TestCase]:
    routes = sorted(analysis["routes"].keys()) or ["/"]
    expected_text = analysis["expected_text"][:max_text_assertions]
    route_expected_text = analysis.get("route_expected_text", {})
    expected_titles = analysis["expected_titles"][:5]

    cases: list[TestCase] = []
    counter = 1

    for route in routes:
        assertions: list[Assertion] = [Assertion(kind="url_path_equals", value=route)]
        cases.append(
            TestCase(
                case_id=f"AUTO-{counter:03d}",
                name=f"Route availability {route}",
                path=route,
                assertions=assertions,
                origin="auto",
            )
        )
        counter += 1

    for route in routes:
        route_text_items = route_expected_text.get(route, [])[:max_text_assertions]
        if not route_text_items:
            continue
        text_assertions = [
            Assertion(kind="text_present", value=text, source=source)
            for text, source in route_text_items
        ]
        cases.append(
            TestCase(
                case_id=f"AUTO-{counter:03d}",
                name=f"UI text inferred from code for {route}",
                path=route,
                assertions=text_assertions,
                origin="auto",
            )
        )
        counter += 1

    # Fallback when route-level inference is unavailable.
    if not route_expected_text and expected_text:
        text_assertions = [
            Assertion(kind="text_present", value=text, source=source)
            for text, source in expected_text
        ]
        cases.append(
            TestCase(
                case_id=f"AUTO-{counter:03d}",
                name="Key UI text from code is visible on home",
                path="/",
                assertions=text_assertions,
                origin="auto",
            )
        )
        counter += 1

    if expected_titles:
        title_assertions = [
            Assertion(kind="title_contains", value=text, source=source)
            for text, source in expected_titles
        ]
        cases.append(
            TestCase(
                case_id=f"AUTO-{counter:03d}",
                name="Page title expectations from code",
                path="/",
                assertions=title_assertions,
                origin="auto",
            )
        )

    return cases
