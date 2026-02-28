from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from qa_agentic_team.models import Assertion, AssertionResult, TestCase, TestResult


def run_test_cases(
    base_url: str,
    test_cases: list[TestCase],
    output_dir: Path,
    browser_name: str = "chromium",
    headless: bool = True,
) -> list[TestResult]:
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser: Browser = getattr(p, browser_name).launch(headless=headless)
        context: BrowserContext = browser.new_context(ignore_https_errors=True)
        page: Page = context.new_page()

        results: list[TestResult] = []
        for case in test_cases:
            results.append(_run_case(page, base_url, case, output_dir))

        context.close()
        browser.close()

    return results


def _run_case(page: Page, base_url: str, case: TestCase, output_dir: Path) -> TestResult:
    target_url = f"{base_url}{case.path}"
    assertion_results: list[AssertionResult] = []
    error = None

    try:
        page.goto(target_url, wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(300)

        for assertion in case.assertions:
            assertion_results.append(_evaluate_assertion(page, assertion))
    except Exception as exc:  # noqa: BLE001
        error = str(exc)

    screenshot_path = output_dir / f"{case.case_id}.png"
    try:
        page.screenshot(path=str(screenshot_path), full_page=True)
    except Exception:  # noqa: BLE001
        screenshot_path.write_text("screenshot failed")

    passed = error is None and all(item.passed for item in assertion_results)

    return TestResult(
        case=case,
        passed=passed,
        assertion_results=assertion_results,
        screenshot_path=str(screenshot_path),
        error=error,
    )


def _evaluate_assertion(page: Page, assertion: Assertion) -> AssertionResult:
    current_url = page.url
    parsed = urlparse(current_url)
    html = page.content()
    title = page.title()

    if assertion.kind == "url_path_equals":
        passed = parsed.path.rstrip("/") == assertion.value.rstrip("/")
        return AssertionResult(
            assertion=assertion,
            passed=passed,
            actual=parsed.path,
            message=f"expected path={assertion.value}",
        )

    if assertion.kind == "text_present":
        passed = _contains_text(html, assertion.value)
        return AssertionResult(
            assertion=assertion,
            passed=passed,
            actual="text found" if passed else "text missing",
            message=f"must include text '{assertion.value}'",
        )

    if assertion.kind == "text_absent":
        passed = not _contains_text(html, assertion.value)
        return AssertionResult(
            assertion=assertion,
            passed=passed,
            actual="text absent" if passed else "text present",
            message=f"must not include text '{assertion.value}'",
        )

    if assertion.kind == "title_contains":
        passed = assertion.value.lower() in title.lower()
        return AssertionResult(
            assertion=assertion,
            passed=passed,
            actual=title,
            message=f"title must include '{assertion.value}'",
        )

    return AssertionResult(
        assertion=assertion,
        passed=False,
        actual="unsupported",
        message="unsupported assertion type",
    )


def _contains_text(html: str, text: str) -> bool:
    normalized_html = re.sub(r"\s+", " ", html).lower()
    normalized_text = re.sub(r"\s+", " ", text).lower()
    return normalized_text in normalized_html
