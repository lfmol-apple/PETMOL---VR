"""Resolve o plano efetivo de uma requisição.

Regras (docs/PLANO_ASSINATURA.md §0 e §5):
  - `plans_enabled` desligado  -> todos "unlimited" (comportamento de hoje; nada muda).
  - casca nativa SEM versão    -> "legacy" (versão atual, gratuita, sem limites).
  - casca versionada / web     -> "premium" se houver assinatura vigente; senão "free" (com limites).
Esta camada só DECIDE e informa; quem aplica limites é cada endpoint, em PRs próprios.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional

from sqlalchemy.orm import Session

from ..config import get_settings
from ..user_auth.legacy_marker import parse_native_ua
from .models import Subscription

ACTIVE_STATUSES = ("active", "grace")


@dataclass(frozen=True)
class PlanInfo:
    plan: str  # "unlimited" | "legacy" | "free" | "premium"
    reason: str
    limits: Dict[str, Optional[int]] = field(default_factory=dict)  # None = sem limite


def free_limits() -> Dict[str, Optional[int]]:
    s = get_settings()
    return {
        "max_pets": s.plans_free_max_pets,
        "vaccine_card_ocr_total": s.plans_free_ocr_total,
        "family_caregivers": s.plans_free_caregivers,
    }


def has_active_subscription(db: Session, user_id: str, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    rows = db.query(Subscription).filter(Subscription.user_id == user_id, Subscription.status.in_(ACTIVE_STATUSES)).all()
    for r in rows:
        end = r.current_period_end
        if end is None:
            return True
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if end > now:
            return True
    return False


def resolve_plan(db: Session, user, user_agent: Optional[str]) -> PlanInfo:
    if not get_settings().plans_enabled:
        return PlanInfo("unlimited", "plans_disabled")
    is_native, version = parse_native_ua(user_agent)
    if is_native and version is None:
        return PlanInfo("legacy", "native_shell_without_version")
    if has_active_subscription(db, user.id):
        return PlanInfo("premium", "active_subscription", {k: None for k in free_limits()})
    return PlanInfo("free", "no_active_subscription", free_limits())
