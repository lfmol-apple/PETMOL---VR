from __future__ import annotations

import os
from collections import defaultdict, deque
from threading import Lock
from typing import Any


_MAX_EVENTS_PER_USER = max(1, int(os.getenv("VISION_MONITOR_MAX_EVENTS_PER_USER", "50")))
_events_by_user: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=_MAX_EVENTS_PER_USER))
_lock = Lock()


def record_product_photo_event(user_id: str, event: dict[str, Any]) -> None:
    if not user_id:
        return
    with _lock:
        _events_by_user[user_id].appendleft(event)


def list_product_photo_events(user_id: str, limit: int = 20) -> list[dict[str, Any]]:
    if not user_id:
        return []
    safe_limit = max(1, min(limit, _MAX_EVENTS_PER_USER))
    with _lock:
        events = list(_events_by_user.get(user_id, ()))
    return events[:safe_limit]
