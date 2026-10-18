"""Lembretes de banho e tosa: o tutor pode DESATIVAR e depois RETOMAR (18/10/2026).

- Desativado: nenhum lembrete de banho/tosa é enviado e os já agendados são cancelados. O histórico fica.
- Retomado: a rotina recomeça — os registros anteriores ficam no histórico, mas deixam de contar para
  "atrasado"; só valem os registros feitos a partir do dia da retomada (`resumed_on`).
- Sem linha para o pet = ativo (nenhum pet existente muda de comportamento).
"""
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, Date, DateTime, String
from sqlalchemy.orm import Session

from ..db import Base, get_db
from ..notifications import Reminder
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .access import get_accessible_pet_or_404

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pets/{pet_id}/grooming-routine", tags=["Grooming"])


class GroomingRoutineSetting(Base):
    __tablename__ = "grooming_routine_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pet_id = Column(String(36), nullable=False, unique=True, index=True)
    active = Column(Boolean, nullable=False, default=True)
    resumed_on = Column(Date, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def grooming_paused(db: Session, pet_id: Optional[str]) -> bool:
    """Pet com os lembretes de banho/tosa desativados (usado pelo envio de lembretes)."""
    if not pet_id:
        return False
    return db.query(GroomingRoutineSetting.id).filter(
        GroomingRoutineSetting.pet_id == pet_id, GroomingRoutineSetting.active == False  # noqa: E712
    ).first() is not None


class RoutineIn(BaseModel):
    active: bool


class RoutineOut(BaseModel):
    active: bool
    resumed_on: Optional[str] = None   # YYYY-MM-DD; só registros desta data em diante contam para o atraso


def _out(row: Optional[GroomingRoutineSetting]) -> RoutineOut:
    if row is None:
        return RoutineOut(active=True, resumed_on=None)
    return RoutineOut(active=bool(row.active), resumed_on=row.resumed_on.isoformat() if row.resumed_on else None)


@router.get("", response_model=RoutineOut)
def get_routine(pet_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_accessible_pet_or_404(db, current_user.id, pet_id)
    return _out(db.query(GroomingRoutineSetting).filter(GroomingRoutineSetting.pet_id == pet_id).first())


@router.put("", response_model=RoutineOut)
def put_routine(pet_id: str, body: RoutineIn, current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    get_accessible_pet_or_404(db, current_user.id, pet_id)
    row = db.query(GroomingRoutineSetting).filter(GroomingRoutineSetting.pet_id == pet_id).first()
    if row is None:
        row = GroomingRoutineSetting(pet_id=pet_id)
        db.add(row)
    was_active = True if row.active is None else bool(row.active)
    row.active = body.active
    if body.active and not was_active:
        row.resumed_on = date.today()      # retomou: a contagem recomeça daqui (histórico preservado)
    if not body.active:
        # Desativou: cancela os avisos de banho/tosa já agendados deste pet.
        db.query(Reminder).filter(
            Reminder.pet_id == pet_id, Reminder.type == "grooming", Reminder.sent == False  # noqa: E712
        ).delete(synchronize_session=False)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _out(row)
