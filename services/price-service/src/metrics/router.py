from __future__ import annotations

import json
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..analytics.models import AnalyticsEvent
from ..db import get_db

router = APIRouter(prefix="/metrics", tags=["Metrics"])

_BRT = ZoneInfo("America/Sao_Paulo")
_RELEVANT_EVENTS = {
    "food_alert_sent",
    "food_alert_opened",
    "food_buy_clicked",
    "food_partner_selected",
    "food_purchase_confirmed",
    "purchase_channel_selected",
}


def _parse_metadata(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _event_day_brt(created_at: datetime, fallback_now: datetime) -> date:
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    try:
        return created_at.astimezone(_BRT).date()
    except Exception:
        return fallback_now.astimezone(_BRT).date()


def _cycle_bucket(days_left: int | None, raw_bucket: str | None) -> str | None:
    if raw_bucket in {"D-3", "D-1", "D", "D+1+"}:
        return raw_bucket
    if days_left is None:
        return None
    if days_left < 0:
        return "D+1+"
    if days_left == 0:
        return "D"
    if days_left == 1:
        return "D-1"
    return "D-3"


def _parse_days_left(metadata: dict[str, Any]) -> int | None:
    raw = metadata.get("days_left")
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        return int(raw)
    if isinstance(raw, str):
        try:
            return int(raw)
        except ValueError:
            return None
    return None


@router.get("/food")
def get_food_metrics(db: Session = Depends(get_db)):
    now = datetime.now(_BRT)
    today = now.date()
    dates = [today - timedelta(days=i) for i in range(6, -1, -1)]
    start_day = dates[0]

    start_dt_brt = datetime.combine(start_day, time.min, tzinfo=_BRT)
    start_dt_utc = start_dt_brt.astimezone(timezone.utc)

    rows = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.created_at >= start_dt_utc)
        .filter(AnalyticsEvent.cta_type.in_(list(_RELEVANT_EVENTS)))
        .all()
    )

    by_day = {
        day.isoformat(): {
            "date": day.isoformat(),
            "alerts_sent": 0,
            "openings": 0,
            "clicks": 0,
            "purchases": 0,
        }
        for day in dates
    }
    cycle_counter: Counter[str] = Counter()
    store_counter: Counter[str] = Counter()
    channel_counter: Counter[str] = Counter()

    totals = {
        "alerts_sent": 0,
        "openings": 0,
        "clicks": 0,
        "purchases": 0,
    }

    for row in rows:
        event_name = (row.cta_type or "").strip()
        if event_name not in _RELEVANT_EVENTS:
            continue

        event_day = _event_day_brt(row.created_at, now)
        if event_day < start_day or event_day > today:
            continue

        day_key = event_day.isoformat()
        meta = _parse_metadata(row.metadata_json)

        if event_name == "food_alert_sent":
            totals["alerts_sent"] += 1
            by_day[day_key]["alerts_sent"] += 1
        elif event_name == "food_alert_opened":
            totals["openings"] += 1
            by_day[day_key]["openings"] += 1
        elif event_name == "food_buy_clicked":
            totals["clicks"] += 1
            by_day[day_key]["clicks"] += 1
        elif event_name == "food_purchase_confirmed":
            totals["purchases"] += 1
            by_day[day_key]["purchases"] += 1

        bucket = _cycle_bucket(
            _parse_days_left(meta),
            meta.get("cycle_bucket") if isinstance(meta.get("cycle_bucket"), str) else None,
        )
        if bucket:
            cycle_counter[bucket] += 1

        if event_name in {"food_partner_selected", "purchase_channel_selected"}:
            store = None
            raw_store = meta.get("store") or meta.get("channel") or row.target
            if isinstance(raw_store, str):
                store = raw_store.strip().lower()
            if store:
                store_counter[store] += 1

            channel_type = meta.get("channel_type") if isinstance(meta.get("channel_type"), str) else None
            if not channel_type:
                if store in {"loja_fisica", "fisico", "physical", "outro"}:
                    channel_type = "physical"
                else:
                    channel_type = "online"
            channel_counter[channel_type] += 1

    cycle_distribution = [
        {"bucket": bucket, "count": cycle_counter.get(bucket, 0)}
        for bucket in ["D-3", "D-1", "D", "D+1+"]
    ]

    return {
        "period": {
            "start_date": start_day.isoformat(),
            "end_date": today.isoformat(),
            "days": 7,
        },
        "totals": totals,
        "by_day": [by_day[d.isoformat()] for d in dates],
        "cycle_distribution": cycle_distribution,
        "by_store": [
            {"store": store, "count": count}
            for store, count in sorted(store_counter.items(), key=lambda item: item[1], reverse=True)
        ],
        "by_channel": [
            {"channel": channel, "count": count}
            for channel, count in sorted(channel_counter.items(), key=lambda item: item[1], reverse=True)
        ],
    }
