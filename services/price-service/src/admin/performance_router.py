"""Aba "Desempenho": quatro números simples, cada um contado NA DATA em que aconteceu.

- Downloads: primeira abertura do app (mesma fonte do funil).
- Se cadastrou: a conta foi criada.
- Cadastrou o pet: a pessoa cadastrou o PRIMEIRO pet.
- Cadastrou a alimentação: a pessoa configurou a ração do primeiro pet.
Nada de funil de coorte: se alguém criou a conta ontem e cadastrou o pet hoje, o pet conta hoje.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func

from ..db import SessionLocal
from ..health.models import FeedingPlan
from ..pets.models import Pet
from ..user_auth.models import User
from ..analytics.models import AnalyticsProductEvent
from .analytics.filters import AnalyticsFilters, platform_clause
from .analytics.growth_bi import _installs, _signup_users
from .analytics.queries import _aware, _feeding_configured_pet_ids
from .deps import get_current_admin

router = APIRouter(prefix="/v1/admin/performance", tags=["Admin Desempenho"])
_BR = ZoneInfo("America/Sao_Paulo")


def _inside(dt: Optional[datetime], since: Optional[datetime], until: Optional[datetime]) -> bool:
    if dt is None:
        return False
    dt = _aware(dt)
    return (since is None or dt >= _aware(since)) and (until is None or dt <= _aware(until))


def _compute(db, since, until, platform: Optional[str], user_ids: Optional[set[str]]) -> dict:
    """Totais e série por dia. `platform` filtra downloads e cadastros; `user_ids` limita pet/alimentação a quem usou a plataforma."""
    f = AnalyticsFilters(since=since, until=until, platform=platform)
    installs = [c for _p, c in _installs(db, f)]
    signups = list(_signup_users(db, f).values())

    real = ~User.email.like("%@petmol.guest")
    first_pet = (db.query(Pet.user_id, func.min(Pet.created_at)).join(User, User.id == Pet.user_id)
                 .filter(real).group_by(Pet.user_id).all())
    pets = [c for u, c in first_pet if _inside(c, since, until) and (user_ids is None or str(u) in user_ids)]

    ok_pets = _feeding_configured_pet_ids(db)
    first_food: dict[str, datetime] = {}
    if ok_pets:
        rows = (db.query(Pet.user_id, FeedingPlan.created_at).join(FeedingPlan, FeedingPlan.pet_id == Pet.id)
                .join(User, User.id == Pet.user_id)
                .filter(real, FeedingPlan.deleted_at.is_(None), FeedingPlan.pet_id.in_(ok_pets)).all())
        for uid, c in rows:
            if user_ids is not None and str(uid) not in user_ids:
                continue
            if c is not None and (uid not in first_food or _aware(c) < _aware(first_food[uid])):
                first_food[uid] = c
    foods = [c for c in first_food.values() if _inside(c, since, until)]

    days: dict[str, dict[str, int]] = defaultdict(lambda: {"downloads": 0, "cadastros": 0, "pets": 0, "alimentacao": 0})
    for key, items in (("downloads", installs), ("cadastros", signups), ("pets", pets), ("alimentacao", foods)):
        for c in items:
            days[_aware(c).astimezone(_BR).date().isoformat()][key] += 1
    return {
        "totals": {"downloads": len(installs), "cadastros": len(signups), "pets": len(pets), "alimentacao": len(foods)},
        "series": [{"date": d, **v} for d, v in sorted(days.items())],
    }


@router.get("")
def performance(since: Optional[datetime] = None, until: Optional[datetime] = None, current=Depends(get_current_admin)):
    """Geral + iPhone × Android (pet e alimentação: pessoas que usaram o app naquela plataforma)."""
    db = SessionLocal()
    try:
        out = _compute(db, since, until, None, None)
        out["platforms"] = {}
        for plat in ("ios", "android"):
            users = {str(u) for (u,) in db.query(AnalyticsProductEvent.user_id)
                     .filter(AnalyticsProductEvent.user_id.isnot(None), platform_clause(AnalyticsProductEvent.platform, plat)).distinct().all()}
            out["platforms"][plat] = _compute(db, since, until, plat, users)
        return out
    finally:
        db.close()
