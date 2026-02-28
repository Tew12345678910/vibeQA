from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class QAConfig:
    project_path: Path
    base_url: str
    include_extensions: list[str]
    max_files: int
    headless: bool
    browser: str


DEFAULT_INCLUDE_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".html"]


def load_config(path: str) -> QAConfig:
    raw = json.loads(Path(path).read_text())
    return QAConfig(
        project_path=Path(raw["project_path"]).resolve(),
        base_url=raw["base_url"].rstrip("/"),
        include_extensions=raw.get("include_extensions", DEFAULT_INCLUDE_EXTENSIONS),
        max_files=int(raw.get("max_files", 300)),
        headless=bool(raw.get("headless", True)),
        browser=raw.get("browser", "chromium"),
    )
