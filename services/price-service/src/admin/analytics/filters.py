"""Global filter object shared by every analytics endpoint.

Only fields that map to real columns are honoured. Anything the database
cannot answer (e.g. a district we never stored) is simply ignored — the
endpoint never fabricates a filtered result.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional


@dataclass
class AnalyticsFilters:
    # period — applied to created_at / received_at depending on the metric
    since: Optional[datetime] = None
    until: Optional[datetime] = None

    # behavioral (analytics_product_events columns)
    platform: Optional[str] = None
    app_version: Optional[str] = None
    os: Optional[str] = None
    # device_type é derivado de os+device_class (ver device_type() em
    # queries.py) — "iphone" | "ipad" | "android" | "desktop" | "outros"
    device_type: Optional[str] = None

    # geo (users columns)
    state: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None

    # drill-down
    user_id: Optional[str] = None
    pet_id: Optional[str] = None

    # bookkeeping — which requested filters had no backing column
    ignored: list[str] = field(default_factory=list)

    @classmethod
    def build(
        cls,
        *,
        period_days: Optional[int] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        platform: Optional[str] = None,
        app_version: Optional[str] = None,
        os: Optional[str] = None,
        device_type: Optional[str] = None,
        state: Optional[str] = None,
        city: Optional[str] = None,
        neighborhood: Optional[str] = None,
        user_id: Optional[str] = None,
        pet_id: Optional[str] = None,
    ) -> "AnalyticsFilters":
        now = datetime.now(timezone.utc)
        _since: Optional[datetime] = None
        _until: Optional[datetime] = None
        if since:
            _since = _parse_dt(since)
        if until:
            _until = _parse_dt(until)
        if _since is None and period_days:
            _since = now - timedelta(days=max(1, min(period_days, 400)))
        return cls(
            since=_since,
            until=_until,
            platform=_clean(platform),
            app_version=_clean(app_version),
            os=_clean(os),
            device_type=_clean(device_type).lower() if _clean(device_type) else None,
            state=_clean(state),
            city=_clean(city),
            neighborhood=_clean(neighborhood),
            user_id=_clean(user_id),
            pet_id=_clean(pet_id),
        )

    @property
    def has_geo(self) -> bool:
        return bool(self.state or self.city or self.neighborhood)


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _parse_dt(raw: str) -> Optional[datetime]:
    raw = raw.strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


# Plataforma normalizada: a UI oferece iOS/Android/PWA/Web, mas o valor cru no
# banco varia por tabela/origem (analytics_product_events manda
# "ios_capacitor"/"android_capacitor" de dentro do app nativo;
# app_installs usa "ios"/"android"). "ios" tem que casar com os dois.
PLATFORM_GROUPS: dict[str, tuple[str, ...]] = {
    "ios": ("ios", "ios_capacitor"),
    "android": ("android", "android_capacitor"),
}


def platform_clause(column, value: str):
    """Cláusula SQL `coluna casa com a plataforma pedida` — aceita o grupo
    normalizado ("ios") ou um valor cru ("ios_capacitor", "pwa", "web")."""
    group = PLATFORM_GROUPS.get(value)
    return column.in_(group) if group else column == value
