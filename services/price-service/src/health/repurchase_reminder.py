"""Lembrete único de recompra: o tutor foi à loja ("Comprar novamente") e não registrou o pacote."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from ..db import SessionLocal
from ..pets.models import Pet
from .models import FeedingPlan, FeedingRepurchaseIntent

logger = logging.getLogger(__name__)
_BR = ZoneInfo("America/Sao_Paulo")
REMIND_AFTER = timedelta(hours=20)
GIVE_UP_AFTER = timedelta(days=5)
SEND_FROM_HOUR, SEND_UNTIL_HOUR = 10, 19


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _de(pet: Pet) -> str:
    sex = (getattr(pet, "sex", None) or "").lower()
    return "da" if sex in ("female", "f", "femea", "fêmea") else "do"


def build_payload(pet: Pet) -> dict:
    return {
        "title": f"Chegou a ração {_de(pet)} {pet.name}? 🥣",
        "body": "Toque para reiniciar o controle em 1 toque — a gente volta a avisar antes de acabar.",
        "tag": f"food-repurchase-{pet.id}",
        "data": {"url": f"/home?modal=food&petId={pet.id}"},
    }


def mark_resolved(db, pet_id: str, now: Optional[datetime] = None) -> None:
    """Chamado quando o novo pacote foi registrado ou a ração trocada (sem commit)."""
    row = db.query(FeedingRepurchaseIntent).filter(FeedingRepurchaseIntent.pet_id == pet_id).first()
    if row and row.resolved_at is None:
        row.resolved_at = now or datetime.now(timezone.utc)


def send_repurchase_reminders(*, now: Optional[datetime] = None, push=None) -> int:
    """Roda de tempos em tempos; só age entre 10h e 19h (Brasília). Uma vez por intenção."""
    now = now or datetime.now(timezone.utc)
    if not (SEND_FROM_HOUR <= now.astimezone(_BR).hour < SEND_UNTIL_HOUR):
        return 0
    if push is None:
        from ..notifications import push_to_user as push
    sent = 0
    db = SessionLocal()
    try:
        rows = (db.query(FeedingRepurchaseIntent)
                .filter(FeedingRepurchaseIntent.reminded_at.is_(None),
                        FeedingRepurchaseIntent.resolved_at.is_(None),
                        FeedingRepurchaseIntent.clicked_at <= now - REMIND_AFTER).all())
        for row in rows:
            try:
                clicked = _aware(row.clicked_at)
                if now - clicked > GIVE_UP_AFTER:
                    row.resolved_at = now  # velho demais: não incomoda
                    continue
                pet = db.query(Pet).filter(Pet.id == row.pet_id).first()
                plan = (db.query(FeedingPlan)
                        .filter(FeedingPlan.pet_id == row.pet_id, FeedingPlan.deleted_at.is_(None)).first())
                if not pet or not plan:
                    row.resolved_at = now
                    continue
                if plan.last_refill_date and plan.last_refill_date >= clicked.astimezone(_BR).date():
                    row.resolved_at = now  # já registrou novo pacote por outro caminho
                    continue
                if push(str(pet.user_id), build_payload(pet)) > 0:
                    row.reminded_at = now
                    sent += 1
            except Exception:
                logger.exception("[repurchase] falha no lembrete do pet %s", row.pet_id)
                db.rollback()
                continue
        db.commit()
    finally:
        db.close()
    return sent
