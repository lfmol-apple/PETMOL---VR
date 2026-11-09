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
from .analytics.filters import AnalyticsFilters
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


@router.get("")
def performance(since: Optional[datetime] = None, until: Optional[datetime] = None, current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        f = AnalyticsFilters(since=since, until=until)
        installs = [c for _p, c in _installs(db, f)]
        signups = list(_signup_users(db, f).values())

        real = ~User.email.like("%@petmol.guest")
        first_pet = (db.query(Pet.user_id, func.min(Pet.created_at)).join(User, User.id == Pet.user_id)
                     .filter(real).group_by(Pet.user_id).all())
        pets = [c for _u, c in first_pet if _inside(c, since, until)]

        ok_pets = _feeding_configured_pet_ids(db)
        first_food: dict[str, datetime] = {}
        if ok_pets:
            rows = (db.query(Pet.user_id, FeedingPlan.created_at).join(FeedingPlan, FeedingPlan.pet_id == Pet.id)
                    .join(User, User.id == Pet.user_id)
                    .filter(real, FeedingPlan.deleted_at.is_(None), FeedingPlan.pet_id.in_(ok_pets)).all())
            for uid, c in rows:
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
    finally:
        db.close()
