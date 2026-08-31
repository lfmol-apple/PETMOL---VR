"""Small in-process request metrics for Mission Control phase 1.

This is intentionally lightweight and best-effort. It gives the launch
dashboard near-real-time health since process start without introducing Redis,
APM, log storage or a warehouse.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Optional


@dataclass(frozen=True)
class RequestMetric:
    at: datetime
    method: str
    path: str
    status: int
    latency_ms: float


_MAX_POINTS = 10_000
_metrics: deque[RequestMetric] = deque(maxlen=_MAX_POINTS)
_lock = Lock()


def record_request_metric(method: str, path: str, status: int, latency_ms: float) -> None:
    try:
        point = RequestMetric(
            at=datetime.now(timezone.utc),
            method=method[:8],
            path=path[:160],
            status=int(status),
            latency_ms=float(latency_ms),
        )
        with _lock:
            _metrics.append(point)
    except Exception:
        pass


def _percentile(values: list[float], pct: float) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * pct)))
    return round(ordered[index], 1)


def request_metrics_summary(window_minutes: int = 60) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
    with _lock:
        rows = [item for item in _metrics if item.at >= cutoff]

    latencies = [item.latency_ms for item in rows]
    errors_5xx = sum(1 for item in rows if item.status >= 500)
    requests = len(rows)
    p95 = _percentile(latencies, 0.95)
    if not rows:
        status = "unknown"
    elif errors_5xx > 0 or (p95 is not None and p95 > 1000):
        status = "attention"
    else:
        status = "normal"

    return {
        "available": bool(rows),
        "window_minutes": window_minutes,
        "requests": requests,
        "errors_5xx": errors_5xx,
        "error_rate": round(errors_5xx / requests, 4) if requests else None,
        "p95_ms": p95,
        "status": status,
        "retention": "in_memory_since_process_start",
    }
