from __future__ import annotations

from pathlib import Path

from qa_agentic_team.models import Assertion, SourceRef, TestCase


# Guideline line format:
# MUST_SEE /path :: text
# MUST_NOT_SEE /path :: text
# TITLE /path :: title fragment

def parse_guidelines(path: str | None) -> list[TestCase]:
    if not path:
        return []

    guideline_path = Path(path)
    if not guideline_path.exists():
        return []

    cases: list[TestCase] = []
    idx = 1
    for line_no, raw_line in enumerate(guideline_path.read_text().splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        try:
            prefix, payload = line.split(" ", 1)
            route, value = [x.strip() for x in payload.split("::", 1)]
        except ValueError:
            continue

        if not route.startswith("/"):
            continue

        source = SourceRef(file=str(guideline_path.resolve()), line=line_no)

        assertion: Assertion | None = None
        if prefix == "MUST_SEE":
            assertion = Assertion(kind="text_present", value=value, source=source)
        elif prefix == "MUST_NOT_SEE":
            assertion = Assertion(kind="text_absent", value=value, source=source)
        elif prefix == "TITLE":
            assertion = Assertion(kind="title_contains", value=value, source=source)

        if assertion is None:
            continue

        cases.append(
            TestCase(
                case_id=f"GL-{idx:03d}",
                name=f"Guideline check {idx}",
                path=route,
                assertions=[assertion],
                origin="guideline",
            )
        )
        idx += 1

    return cases
