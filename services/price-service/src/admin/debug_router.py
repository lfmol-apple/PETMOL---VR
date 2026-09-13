"""Read-only production inspector for support/debugging.

Every route here is GET and guarded by ``get_current_admin_or_readonly_key``
(master admin JWT *or* the standing ``ADMIN_OPS_API_KEY`` header). It exists so
support can pull the full picture of one account's health records — vaccines,
antiparasitics, grooming, feeding, reminders — without a DB shell.

Never add a write/delete route here: the API key has no per-action audit trail.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.models import User
from ..pets.models import Pet
from ..pets.vaccine_models import VaccineRecord
from ..pets.parasite_models import ParasiteControlRecord
from ..pets.grooming_models import GroomingRecord
from ..health.models import FeedingPlan
from ..notifications import Reminder
from .deps import get_current_admin_or_readonly_key

router = APIRouter(prefix="/v1/admin/debug", tags=["Admin Debug"])


def _norm(value: Any) -> Any:
    # Datas são gravadas como timestamptz; o app serializa tudo em UTC ("...Z")
    # e mostra só a parte da data. Normalizar aqui pra UTC deixa a saída
    # diretamente comparável com o que o tutor vê na tela.
    if isinstance(value, datetime):
        dt = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    return value


def _row_to_dict(obj: Any) -> dict:
    """Every mapped column of a SQLAlchemy row as a plain dict (datas em UTC)."""
    mapper = sa_inspect(obj).mapper
    return {col.key: _norm(getattr(obj, col.key)) for col in mapper.column_attrs}


@router.get("/user")
def inspect_user(
    email: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    include_deleted: bool = Query(default=True),
    _auth=Depends(get_current_admin_or_readonly_key),
    db: Session = Depends(get_db),
):
    """Full health-record dump for one account (by email or user_id)."""
    if not email and not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="informe email ou user_id")

    q = db.query(User)
    if user_id:
        q = q.filter(User.id == user_id)
    else:
        q = q.filter(User.email == email.strip().lower())
    user = q.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="usuário não encontrado")

    pets = db.query(Pet).filter(Pet.user_id == user.id).order_by(Pet.created_at).all()

    def _for_pet(model, pet_id: str, order_col: str) -> list[dict]:
        rows = db.query(model).filter(model.pet_id == pet_id)
        if not include_deleted and hasattr(model, "deleted"):
            rows = rows.filter(model.deleted.is_(False))
        rows = rows.order_by(getattr(model, order_col)).all()
        return [_row_to_dict(r) for r in rows]

    pets_out = []
    for p in pets:
        pets_out.append(
            {
                "pet": _row_to_dict(p),
                "vaccine_records": _for_pet(VaccineRecord, p.id, "applied_date"),
                "parasite_control_records": _for_pet(ParasiteControlRecord, p.id, "date_applied"),
                "grooming_records": _for_pet(GroomingRecord, p.id, "created_at"),
                "feeding_plans": _for_pet(FeedingPlan, p.id, "created_at"),
                "reminders": [
                    _row_to_dict(r)
                    for r in db.query(Reminder)
                    .filter(Reminder.pet_id == p.id)
                    .order_by(Reminder.remind_at)
                    .all()
                ],
            }
        )

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "created_at": user.created_at,
        },
        "pets": pets_out,
        "counts": {
            "pets": len(pets_out),
            "vaccine_records": sum(len(x["vaccine_records"]) for x in pets_out),
        },
    }
