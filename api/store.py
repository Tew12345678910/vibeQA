"""
In-memory store for audit runs. run_id -> { simple, runMode }.
"""
from typing import Any, Dict, Optional

_runs: Dict[str, Dict[str, Any]] = {}


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    return _runs.get(run_id)


def set_run(run_id: str, data: Dict[str, Any]) -> None:
    _runs[run_id] = data


def has_run(run_id: str) -> bool:
    return run_id in _runs
