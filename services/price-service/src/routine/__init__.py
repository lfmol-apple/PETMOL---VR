"""Rotina do pet — lembrete de passeio (16/10/2026).

O tutor liga/desliga por pet, escolhe os dias da semana e UM OU MAIS horários
no dia (uma vez, duas, até MAX_TIMES). Não há
um "enviador" novo: este módulo só garante que sempre exista UM `Reminder`
pendente do tipo "walk" para o próximo horário; quem envia é o
`send_due_reminders` de sempre (a cada minuto, com dedup, retry, família e
cuidadores, iOS/Android/web). Depois que um aviso sai, o job abaixo cria o
próximo.

Tudo atrás de `routine_walk_enabled` (config, DESLIGADO por padrão): desligado,
os endpoints respondem 404, o job só limpa e o `send_due_reminders` não envia
nenhum lembrete "walk". Religar = env var + restart (sem deploy).
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import Base, SessionLocal, get_db
from ..notifications import Reminder
from ..pets.access import get_accessible_pet_or_404
from ..pets.models import Pet
from ..user_auth.deps import get_current_user
from ..user_auth.models import User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Routine"])

DEFAULT_TZ = "America/Sao_Paulo"
WALK_TYPE = "walk"
# Aviso mais velho que isto (ex.: API ficou fora do ar) é descartado em vez de
# chegar horas depois do passeio.
STALE_AFTER = timedelta(minutes=30)
ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]  # ISO: 1 = segunda ... 7 = domingo
MAX_TIMES = 6


class RoutineWalk(Base):
    __tablename__ = "routine_walks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pet_id = Column(String(36), nullable=False, unique=True, index=True)
    user_id = Column(String(36), nullable=False, index=True)   # quem configurou
    enabled = Column(Boolean, nullable=False, default=False)
    days_csv = Column(String(20), nullable=False, default="1,2,3,4,5,6,7")
    times_csv = Column(String(60), nullable=False, default="18:00")
    tz = Column(String(64), nullable=False, default=DEFAULT_TZ)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def feature_enabled() -> bool:
    return bool(get_settings().routine_walk_enabled)


def _days(cfg: RoutineWalk) -> List[int]:
    out = sorted({int(d) for d in (cfg.days_csv or "").split(",") if d.strip().isdigit() and 1 <= int(d) <= 7})
    return out or list(ALL_DAYS)


def _times(cfg: RoutineWalk) -> List[str]:
    out = sorted({t.strip() for t in (cfg.times_csv or "").split(",") if _valid_time(t.strip())})
    return out or ["18:00"]


def _valid_time(t: str) -> bool:
    try:
        hh, mm = t.split(":")
        return len(t) == 5 and 0 <= int(hh) <= 23 and 0 <= int(mm) <= 59
    except Exception:
        return False


def _zone(name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TZ)
    except Exception:  # fuso inválido nunca derruba o lembrete
        return ZoneInfo(DEFAULT_TZ)


def next_occurrence(days: List[int], times: List[str], tz_name: str, now_utc: datetime) -> Optional[datetime]:
    """Próximo horário (em UTC) estritamente depois de `now_utc`, nos dias e horários escolhidos, no fuso do tutor."""
    zone = _zone(tz_name)
    clean = sorted({t for t in times if _valid_time(t)}) or ["18:00"]
    local_now = now_utc.astimezone(zone)
    for offset in range(0, 9):
        day = (local_now + timedelta(days=offset)).date()
        if datetime(day.year, day.month, day.day, tzinfo=zone).isoweekday() not in days:
            continue
        for t in clean:
            hh, mm = (int(x) for x in t.split(":"))
            candidate = datetime(day.year, day.month, day.day, hh, mm, tzinfo=zone)
            if candidate > local_now:
                return candidate.astimezone(timezone.utc)
    return None


def _pending_walk(db: Session, pet_id: str) -> List[Reminder]:
    return db.query(Reminder).filter(
        Reminder.pet_id == pet_id, Reminder.type == WALK_TYPE, Reminder.sent == False  # noqa: E712
    ).all()


def _title_body(pet_name: Optional[str]) -> tuple:
    name = (pet_name or "").strip()
    title = f"Hora do passeio de {name} 🐾" if name else "Hora do passeio 🐾"
    return title, "Um passeio faz bem para vocês dois. Toque para abrir o PETMOL."


def sync_pet_reminder(db: Session, cfg: RoutineWalk, now: Optional[datetime] = None) -> None:
    """Apaga os avisos pendentes do pet e cria o próximo, se estiver ligado."""
    now = now or datetime.now(timezone.utc)
    for r in _pending_walk(db, cfg.pet_id):
        db.delete(r)
    if cfg.enabled and feature_enabled():
        when = next_occurrence(_days(cfg), _times(cfg), cfg.tz, now)
        if when:
            pet = db.query(Pet).filter(Pet.id == cfg.pet_id).first()
            title, body = _title_body(getattr(pet, "name", None))
            db.add(Reminder(user_id=cfg.user_id, pet_id=cfg.pet_id, type=WALK_TYPE,
                            title=title, body=body, remind_at=when))
    db.commit()


def ensure_walk_reminders(now: Optional[datetime] = None) -> None:
    """Job (a cada poucos minutos): descarta aviso velho e garante o próximo de cada pet ligado."""
    db = SessionLocal()
    try:
        now = now or datetime.now(timezone.utc)
        if not feature_enabled():
            for r in db.query(Reminder).filter(Reminder.type == WALK_TYPE, Reminder.sent == False).all():  # noqa: E712
                db.delete(r)
            db.commit()
            return
        for r in db.query(Reminder).filter(Reminder.type == WALK_TYPE, Reminder.sent == False,  # noqa: E712
                                           Reminder.remind_at < now - STALE_AFTER).all():
            db.delete(r)
        db.commit()
        for cfg in db.query(RoutineWalk).filter(RoutineWalk.enabled == True).all():  # noqa: E712
            if not _pending_walk(db, cfg.pet_id):
                sync_pet_reminder(db, cfg, now)
    except Exception:
        logger.exception("[routine] falha ao garantir lembretes de passeio")
        db.rollback()
    finally:
        db.close()


# ── API ──────────────────────────────────────────────────────────────────────

class WalkIn(BaseModel):
    enabled: bool
    days: List[int] = Field(default_factory=lambda: list(ALL_DAYS))
    times: List[str] = Field(default_factory=lambda: ["18:00"], min_length=1, max_length=MAX_TIMES)
    tz: Optional[str] = Field(None, max_length=64)

    @field_validator("times")
    @classmethod
    def _check_times(cls, v: List[str]) -> List[str]:
        if not all(_valid_time(t) for t in v):
            raise ValueError("horário inválido (use HH:MM)")
        return sorted(set(v))


class WalkOut(BaseModel):
    enabled: bool
    days: List[int]
    times: List[str]
    tz: str


def _out(cfg: Optional[RoutineWalk]) -> WalkOut:
    if cfg is None:
        return WalkOut(enabled=False, days=[1, 2, 3, 4, 5], times=["18:00"], tz=DEFAULT_TZ)
    return WalkOut(enabled=bool(cfg.enabled), days=_days(cfg), times=_times(cfg), tz=cfg.tz)


def _require_feature() -> None:
    if not feature_enabled():
        raise HTTPException(status_code=404, detail="Recurso indisponível")


@router.get("/pets/{pet_id}/routine/walk", response_model=WalkOut)
def get_walk(pet_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_feature()
    get_accessible_pet_or_404(db, current_user.id, pet_id)
    return _out(db.query(RoutineWalk).filter(RoutineWalk.pet_id == pet_id).first())


@router.put("/pets/{pet_id}/routine/walk", response_model=WalkOut)
def put_walk(pet_id: str, body: WalkIn, current_user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    _require_feature()
    get_accessible_pet_or_404(db, current_user.id, pet_id)
    days = sorted({d for d in body.days if 1 <= d <= 7}) or list(ALL_DAYS)
    tz = body.tz if body.tz and _zone(body.tz).key == body.tz else DEFAULT_TZ
    cfg = db.query(RoutineWalk).filter(RoutineWalk.pet_id == pet_id).first()
    if cfg is None:
        cfg = RoutineWalk(pet_id=pet_id, user_id=str(current_user.id))
        db.add(cfg)
    cfg.user_id = str(current_user.id)
    cfg.enabled = body.enabled
    cfg.days_csv = ",".join(str(d) for d in days)
    cfg.times_csv = ",".join(body.times)
    cfg.tz = tz
    cfg.updated_at = datetime.now(timezone.utc)
    db.commit()
    sync_pet_reminder(db, cfg)
    return _out(cfg)
