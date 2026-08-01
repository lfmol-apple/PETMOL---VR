from __future__ import annotations

import json
import os
from collections import defaultdict, deque
from threading import Lock
from typing import Any


_MAX_EVENTS_PER_USER = max(1, int(os.getenv("VISION_MONITOR_MAX_EVENTS_PER_USER", "50")))
_events_by_user: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=_MAX_EVENTS_PER_USER))
_lock = Lock()

# Production runs multiple worker processes behind the reverse proxy — an
# in-memory dict alone is per-process, so a debug-dump request can land on a
# worker that never saw the event a test just produced. Also persist to a
# shared file (outside the app dir, so `rsync --delete` on deploy doesn't
# wipe it) so every worker reads the same history regardless of which one
# handled the original request. TODO: remove alongside the rest of this
# temporary diagnostic instrumentation once the investigation is closed.
_SHARED_LOG_PATH = os.getenv("VISION_MONITOR_LOG_PATH", "/opt/petmol/logs/vision_monitor_events.jsonl")
_MAX_SHARED_LINES = 500


def _append_to_shared_log(user_id: str, event: dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(_SHARED_LOG_PATH), exist_ok=True)
        with open(_SHARED_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps({"user_id": user_id, **event}, ensure_ascii=False) + "\n")
    except OSError:
        pass  # diagnostic-only — never let logging break the actual request


def _read_shared_log() -> list[dict[str, Any]]:
    try:
        with open(_SHARED_LOG_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()[-_MAX_SHARED_LINES:]
    except OSError:
        return []
    events = []
    for line in lines:
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def record_product_photo_event(user_id: str, event: dict[str, Any]) -> None:
    if not user_id:
        return
    with _lock:
        _events_by_user[user_id].appendleft(event)
    _append_to_shared_log(user_id, event)


def list_product_photo_events(user_id: str, limit: int = 20) -> list[dict[str, Any]]:
    if not user_id:
        return []
    safe_limit = max(1, min(limit, _MAX_EVENTS_PER_USER))
    shared = [e for e in _read_shared_log() if e.get("user_id") == user_id]
    shared.sort(key=lambda e: e.get("timestamp") or "", reverse=True)
    if shared:
        return shared[:safe_limit]
    with _lock:
        events = list(_events_by_user.get(user_id, ()))
    return events[:safe_limit]


def list_all_recent_events(limit: int = 20) -> list[dict[str, Any]]:
    """Cross-user recent events, newest first. Temporary diagnostic use only —
    backs the token-gated debug-dump endpoint. TODO: remove alongside it."""
    shared = _read_shared_log()
    if shared:
        shared.sort(key=lambda e: e.get("timestamp") or "", reverse=True)
        return shared[: max(1, limit)]
    with _lock:
        all_events = [event for events in _events_by_user.values() for event in events]
    all_events.sort(key=lambda e: e.get("timestamp") or "", reverse=True)
    return all_events[: max(1, limit)]
