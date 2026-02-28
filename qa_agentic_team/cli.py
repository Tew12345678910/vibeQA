from __future__ import annotations

import argparse
from pathlib import Path

from qa_agentic_team.browser_runner import run_test_cases
from qa_agentic_team.code_analyzer import analyze_project
from qa_agentic_team.config import load_config
from qa_agentic_team.guideline_parser import parse_guidelines
from qa_agentic_team.reporter import build_fix_tasks, write_reports
from qa_agentic_team.test_case_generator import generate_auto_test_cases


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Agentic UI QA pipeline")
    parser.add_argument("--config", required=True, help="Path to JSON config")
    parser.add_argument(
        "--guideline",
        default=None,
        help="Optional guideline file (MUST_SEE/MUST_NOT_SEE/TITLE syntax)",
    )
    parser.add_argument("--output", default="output", help="Output directory")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    output_dir = Path(args.output).resolve()

    analysis = analyze_project(
        config.project_path,
        include_extensions=config.include_extensions,
        max_files=config.max_files,
    )

    auto_cases = generate_auto_test_cases(analysis)
    guideline_cases = parse_guidelines(args.guideline)
    test_cases = auto_cases + guideline_cases

    screenshot_dir = output_dir / "screenshots"
    results = run_test_cases(
        base_url=config.base_url,
        test_cases=test_cases,
        output_dir=screenshot_dir,
        browser_name=config.browser,
        headless=config.headless,
    )

    fix_tasks = build_fix_tasks(results)
    paths = write_reports(output_dir, analysis, results, fix_tasks)

    print("UI QA pipeline finished")
    print(f"Test cases: {len(test_cases)}")
    print(f"Reports:\n- {paths['md_report']}\n- {paths['json_report']}\n- {paths['fix_json']}")


if __name__ == "__main__":
    main()
