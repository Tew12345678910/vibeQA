from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

from qa_agentic_team.models import SourceRef


ROUTE_PATTERNS = [
    re.compile(r"<Route[^>]*path=[\"']([^\"']+)[\"']", re.IGNORECASE),
    re.compile(r"path\s*[:=]\s*[\"'](/[^\"']*)[\"']", re.IGNORECASE),
]
ROUTE_COMPONENT_PATTERN = re.compile(
    r"<Route[^>]*path=[\"']([^\"']+)[\"'][^>]*element=\{<([A-Za-z_][A-Za-z0-9_]*)",
    re.IGNORECASE,
)
HEADING_PATTERN = re.compile(r"<h[1-3][^>]*>([^<]{1,120})</h[1-3]>", re.IGNORECASE)
BUTTON_PATTERN = re.compile(r"<button[^>]*>([^<]{1,120})</button>", re.IGNORECASE)
TITLE_PATTERN = re.compile(r"<title[^>]*>([^<]{1,120})</title>", re.IGNORECASE)


def _line_for_offset(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def analyze_project(project_path: Path, include_extensions: list[str], max_files: int) -> dict:
    files = [
        p
        for p in project_path.rglob("*")
        if p.is_file() and p.suffix.lower() in include_extensions
    ][:max_files]

    routes: dict[str, list[SourceRef]] = defaultdict(list)
    expected_text: list[tuple[str, SourceRef]] = []
    expected_titles: list[tuple[str, SourceRef]] = []
    route_expected_text: dict[str, list[tuple[str, SourceRef]]] = defaultdict(list)

    for file in files:
        try:
            content = file.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        rel_file = str(file)

        for pattern in ROUTE_PATTERNS:
            for match in pattern.finditer(content):
                route = match.group(1).strip()
                if not route.startswith("/"):
                    continue
                routes[route].append(SourceRef(file=rel_file, line=_line_for_offset(content, match.start())))

        for pattern in (HEADING_PATTERN, BUTTON_PATTERN):
            for match in pattern.finditer(content):
                text = " ".join(match.group(1).split())
                if text:
                    expected_text.append(
                        (text, SourceRef(file=rel_file, line=_line_for_offset(content, match.start())))
                    )

        for match in TITLE_PATTERN.finditer(content):
            text = " ".join(match.group(1).split())
            if text:
                expected_titles.append(
                    (text, SourceRef(file=rel_file, line=_line_for_offset(content, match.start())))
                )

        component_text_map = _extract_component_text_map(content, rel_file)
        for match in ROUTE_COMPONENT_PATTERN.finditer(content):
            route = match.group(1).strip()
            component = match.group(2).strip()
            if not route.startswith("/"):
                continue
            for text, ref in component_text_map.get(component, []):
                route_expected_text[route].append((text, ref))

    dedup_text = _dedupe_text_refs(expected_text)
    dedup_titles = _dedupe_text_refs(expected_titles)
    dedup_route_text = {
        route: _dedupe_text_refs(items)
        for route, items in route_expected_text.items()
    }

    return {
        "routes": dict(routes),
        "expected_text": dedup_text,
        "route_expected_text": dedup_route_text,
        "expected_titles": dedup_titles,
        "scanned_files": len(files),
    }


def _dedupe_text_refs(items: list[tuple[str, SourceRef]]) -> list[tuple[str, SourceRef]]:
    seen: set[str] = set()
    out: list[tuple[str, SourceRef]] = []
    for text, ref in items:
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append((text, ref))
    return out


def _extract_component_text_map(content: str, rel_file: str) -> dict[str, list[tuple[str, SourceRef]]]:
    component_map: dict[str, list[tuple[str, SourceRef]]] = defaultdict(list)
    for match in re.finditer(r"function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{", content):
        component_name = match.group(1)
        body = _extract_brace_block(content, match.end() - 1)
        if not body:
            continue
        for pattern in (HEADING_PATTERN, BUTTON_PATTERN):
            for inner in pattern.finditer(body):
                text = " ".join(inner.group(1).split())
                if not text:
                    continue
                absolute_offset = match.end() + inner.start()
                component_map[component_name].append(
                    (text, SourceRef(file=rel_file, line=_line_for_offset(content, absolute_offset)))
                )
    return component_map


def _extract_brace_block(content: str, brace_pos: int) -> str:
    if brace_pos < 0 or brace_pos >= len(content) or content[brace_pos] != "{":
        return ""

    depth = 0
    start = brace_pos + 1
    for idx in range(brace_pos, len(content)):
        ch = content[idx]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return content[start:idx]
    return ""
