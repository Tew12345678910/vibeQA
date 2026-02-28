from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from qa_agentic_team.code_analyzer import analyze_project
from qa_agentic_team.config import DEFAULT_INCLUDE_EXTENSIONS
from qa_agentic_team.guideline_parser import parse_guidelines
from qa_agentic_team.test_case_generator import generate_auto_test_cases


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate QA test manifest")
    parser.add_argument("--project-path", required=True, help="Codebase path to scan")
    parser.add_argument("--guideline", default=None, help="Optional guideline file")
    parser.add_argument("--max-files", type=int, default=300)
    parser.add_argument(
        "--include-extensions",
        default=",".join(DEFAULT_INCLUDE_EXTENSIONS),
        help="Comma-separated extensions",
    )
    parser.add_argument("--output", default="", help="Optional output path; stdout when omitted")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    include_extensions = [p.strip() for p in args.include_extensions.split(",") if p.strip()]

    analysis = analyze_project(
        project_path=Path(args.project_path).resolve(),
        include_extensions=include_extensions,
        max_files=args.max_files,
    )
    auto_cases = generate_auto_test_cases(analysis)
    guideline_cases = parse_guidelines(args.guideline)
    all_cases = auto_cases + guideline_cases

    manifest = {
        "analysisSummary": {
            "scannedFiles": analysis["scanned_files"],
            "routesFound": sorted(analysis["routes"].keys()),
            "expectedTextCount": len(analysis["expected_text"]),
            "expectedTitleCount": len(analysis["expected_titles"]),
        },
        "testCases": [
            {
                "caseId": case.case_id,
                "name": case.name,
                "path": case.path,
                "origin": case.origin,
                "assertions": [
                    {
                        "kind": assertion.kind,
                        "value": assertion.value,
                        **(
                            {
                                "source": {
                                    "file": assertion.source.file,
                                    "line": assertion.source.line,
                                }
                            }
                            if assertion.source
                            else {}
                        ),
                    }
                    for assertion in case.assertions
                ],
            }
            for case in all_cases
        ],
    }

    payload = json.dumps(manifest, indent=2)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(payload)
        print(str(output_path.resolve()))
        return

    print(payload)


if __name__ == "__main__":
    main()
