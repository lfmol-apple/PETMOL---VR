"""Rotina do pet — lembrete de banho (e tosa) (18/10/2026).

O tutor liga/desliga por pet, escolhe de quantos em quantos dias (qualquer número)
e a hora/minuto. Mesmo desenho do passeio: este módulo só garante que exista UM
`Reminder` pendente do tipo "bath" para o próximo aviso; quem envia é o
`send_due_reminders` de sempre.

Regras do aviso (um por ciclo, sem insistir):
- próximo aviso = data do último banho (ou a de quando ligou) + intervalo, na hora escolhida;
- vencido e ainda sem aviso neste ciclo → avisa no próximo horário (hoje ou amanhã);
- já avisou neste ciclo → espera o tutor registrar ("Dei banho hoje") ou adiar.

Atrás de `routine_bath_enabled` (config, DESLIGADO por padrão): desligado, os
endpoints respondem 404 e nenhum lembrete "bath" é enviado.
"""
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import Base, SessionLocal, get_db
from ..notifications import Reminder
from ..pets.access import get_accessible_pet_or_404
from ..pets.grooming_models import GroomingRecord
from ..pets.models import Pet
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from . import DEFAULT_TZ, STALE_AFTER, _valid_time, _zone

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Routine"])

BATH_TYPE = "bath"
DEFAULT_INTERVAL = 15
MAX_INTERVAL = 365
BATH_TYPES = ("bath", "bath_grooming")


class RoutineBath(Base):
    __tablename__ = "routine_baths"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pet_id = Column(String(36), nullable=False, unique=True, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, default=False)
    interval_days = Column(Integer, nullable=False, default=DEFAULT_INTERVAL)
    time = Column(String(5), nullable=False, default="10:00")
    with_grooming = Column(Boolean, nullable=False, default=False)
    tz = Column(String(64), nullable=False, default=DEFAULT_TZ)
    petshop_name = Column(String(200), nullable=True)
    petshop_phone = Column(String(40), nullable=True)
    started_on = Column(Date, nullable=True)          # dia em que ligou (base se nunca houve banho)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def feature_enabled() -> bool:
    return bool(get_settings().routine_bath_enabled)


def bath_routine_active(db: Session, pet_id: Optional[str]) -> bool:
    """Pet com rotina de banho ligada (e recurso ligado) — os avisos antigos de 'grooming' ficam de fora."""
    if not pet_id or not feature_enabled():
        return False
    return db.query(RoutineBath.id).filter(RoutineBath.pet_id == pet_id, RoutineBath.enabled == True).first() is not None  # noqa: E712


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _last_bath(db: Session, pet_id: str) -> Optional[GroomingRecord]:
    return (db.query(GroomingRecord)
            .filter(GroomingRecord.pet_id == pet_id, GroomingRecord.deleted == False,  # noqa: E712
                    GroomingRecord.type.in_(BATH_TYPES))
            .order_by(GroomingRecord.date.desc()).first())


def _pending(db: Session, pet_id: str):
    return db.query(Reminder).filter(
        Reminder.pet_id == pet_id, Reminder.type == BATH_TYPE, Reminder.sent == False  # noqa: E712
    ).all()


def _at(zone: ZoneInfo, day: date, hhmm: str) -> datetime:
    hh, mm = (int(x) for x in hhmm.split(":"))
    return datetime(day.year, day.month, day.day, hh, mm, tzinfo=zone)


def base_date(cfg: RoutineBath, last: Optional[GroomingRecord]) -> date:
    zone = _zone(cfg.tz)
    if last is not None:
        return _aware(last.date).astimezone(zone).date()
    return cfg.started_on or datetime.now(zone).date()


def next_bath_at(db: Session, cfg: RoutineBath, now_utc: datetime) -> Optional[datetime]:
    """Quando o próximo aviso deve sair (UTC) ou None se já avisou neste ciclo."""
    zone = _zone(cfg.tz)
    hhmm = cfg.time if _valid_time(cfg.time or "") else "10:00"
    interval = max(1, min(int(cfg.interval_days or DEFAULT_INTERVAL), MAX_INTERVAL))
    last = _last_bath(db, cfg.pet_id)
    base = base_date(cfg, last)
    local_now = now_utc.astimezone(zone)
    due = _at(zone, base + timedelta(days=interval), hhmm)
    if due > local_now:
        return due.astimezone(timezone.utc)
    cycle_start = _at(zone, base, "00:00").astimezone(timezone.utc)
    already = db.query(Reminder.id).filter(
        Reminder.pet_id == cfg.pet_id, Reminder.type == BATH_TYPE, Reminder.sent == True,  # noqa: E712
        Reminder.remind_at >= cycle_start,
    ).first()
    if already:
        return None
    today = _at(zone, local_now.date(), hhmm)
    when = today if today > local_now else _at(zone, local_now.date() + timedelta(days=1), hhmm)
    return when.astimezone(timezone.utc)


def _title_body(pet_name: Optional[str], with_grooming: bool) -> tuple:
    name = (pet_name or "").strip()
    what = "banho e tosa" if with_grooming else "banho"
    title = f"Dia do {what} de {name} 🛁" if name else f"Dia do {what} 🛁"
    return title, "Toque para abrir o PETMOL: registre o banho ou chame o petshop."


def sync_pet_reminder(db: Session, cfg: RoutineBath, now: Optional[datetime] = None) -> None:
    """Apaga os avisos pendentes do pet e cria o próximo, se estiver ligado."""
    now = now or datetime.now(timezone.utc)
    for r in _pending(db, cfg.pet_id):
        db.delete(r)
    if cfg.enabled and feature_enabled():
        when = next_bath_at(db, cfg, now)
        if when:
            pet = db.query(Pet).filter(Pet.id == cfg.pet_id).first()
            title, body = _title_body(getattr(pet, "name", None), bool(cfg.with_grooming))
            db.add(Reminder(user_id=cfg.user_id, pet_id=cfg.pet_id, type=BATH_TYPE,
                            title=title, body=body, remind_at=when))
    db.commit()


def ensure_bath_reminders(now: Optional[datetime] = None) -> None:
    """Job: descarta aviso velho e garante o próximo de cada pet ligado."""
    db = SessionLocal()
    try:
        now = now or datetime.now(timezone.utc)
        if not feature_enabled():
            for r in db.query(Reminder).filter(Reminder.type == BATH_TYPE, Reminder.sent == False).all():  # noqa: E712
                db.delete(r)
            db.commit()
            return
        for r in db.query(Reminder).filter(Reminder.type == BATH_TYPE, Reminder.sent == False,  # noqa: E712
                                           Reminder.remind_at < now - STALE_AFTER).all():
            db.delete(r)
        db.commit()
        for cfg in db.query(RoutineBath).filter(RoutineBath.enabled == True).all():  # noqa: E712
            if not _pending(db, cfg.pet_id):
                sync_pet_reminder(db, cfg, now)
    except Exception:
        logger.exception("[routine] falha ao garantir lembretes de banho")
        db.rollback()
    finally:
        db.close()


# ── API ──────────────────────────────────────────────────────────────────────

class BathIn(BaseModel):
    enabled: bool
    interval_days: int = Field(DEFAULT_INTERVAL, ge=1, le=MAX_INTERVAL)
    time: str = "10:00"
    with_grooming: bool = False
    tz: Optional[str] = Field(None, max_length=64)
    petshop_name: Optional[str] = Field(None, max_length=200)
    petshop_phone: Optional[str] = Field(None, max_length=40)

    @field_validator("time")
    @classmethod
    def _check_time(cls, v: str) -> str:
        if not _valid_time(v):
            raise ValueError("horário inválido (use HH:MM)")
        return v


class BathOut(BaseModel):
    enabled: bool
    interval_days: int
    time: str
    with_grooming: bool
    tz: str
    petshop_name: Optional[str] = None
    petshop_phone: Optional[str] = None      # do tutor; se vazio, o do último registro de banho/tosa
    last_bath_on: Optional[str] = None       # YYYY-MM-DD (data local)
    next_at: Optional[str] = None            # ISO UTC do próximo aviso


def _out(db: Session, cfg: Optional[RoutineBath], pet_id: str) -> BathOut:
    last = _last_bath(db, pet_id)
    if cfg is None:
        return BathOut(enabled=False, interval_days=DEFAULT_INTERVAL, time="10:00", with_grooming=False,
                       tz=DEFAULT_TZ, petshop_name=getattr(last, "location", None),
                       petshop_phone=getattr(last, "location_phone", None),
                       last_bath_on=base_date(RoutineBath(tz=DEFAULT_TZ), last).isoformat() if last else None)
    nxt = _pending(db, pet_id)
    when = min((_aware(r.remind_at) for r in nxt), default=None) if cfg.enabled else None
    return BathOut(
        enabled=bool(cfg.enabled), interval_days=int(cfg.interval_days or DEFAULT_INTERVAL),
        time=cfg.time if _valid_time(cfg.time or "") else "10:00", with_grooming=bool(cfg.with_grooming),
        tz=cfg.tz, petshop_name=cfg.petshop_name or getattr(last, "location", None),
        petshop_phone=cfg.petshop_phone or getattr(last, "location_phone", None),
        last_bath_on=base_date(cfg, last).isoformat() if last else None,
        next_at=when.isoformat() if when else None,
    )


def _require_feature() -> None:
    if not feature_enabled():
        raise HTTPException(status_code=404, detail="Recurso indisponível")


def _get_cfg(db: Session, pet_id: str) -> Optional[RoutineBath]:
    return db.query(RoutineBath).filter(RoutineBath.pet_id == pet_id).first()


@router.get("/pets/{pet_id}/routine/bath", response_model=BathOut)
def get_bath(pet_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_feature()
    get_accessible_pet_or_404(db, current_user.id, pet_id)
    return _out(db, _get_cfg(db, pet_id), pet_id)


@router.put("/pets/{pet_id}/routine/bath", response_model=BathOut)
def put_bath(pet_id: str, body: BathIn, current_user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    _require_feature()
    get_accessible_pet_or_404(db, current_user.id, pet_id)
    tz = body.tz if body.tz and _zone(body.tz).key == body.tz else DEFAULT_TZ
    cfg = _get_cfg(db, pet_id)
    if cfg is None:
        cfg = RoutineBath(pet_id=pet_id, user_id=str(current_user.id))
        db.add(cfg)
    if body.enabled and not cfg.enabled:
        cfg.started_on = datetime.now(_zone(tz)).date()   # recomeça a contar ao (re)ligar
    cfg.user_id = str(current_user.id)
    cfg.enabled = body.enabled
    cfg.interval_days = body.interval_days
    cfg.time = body.time
    cfg.with_grooming = body.with_grooming
    cfg.tz = tz
    cfg.petshop_name = (body.petshop_name or "").strip() or None
    cfg.petshop_phone = (body.petshop_phone or "").strip() or None
    cfg.updated_at = datetime.now(timezone.utc)
    db.commit()
    sync_pet_reminder(db, cfg)
    return _out(db, cfg, pet_id)


@router.post("/pets/{pet_id}/routine/bath/done", response_model=BathOut)
def bath_done(pet_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """"Dei banho hoje": registra o banho (histórico) e recalcula o próximo aviso a partir de hoje."""
    _require_feature()
    get_accessible_pet_or_404(db, current_user.id, pet_id)
    cfg = _get_cfg(db, pet_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Rotina de banho não configurada")
    last = _last_bath(db, pet_id)
    now = datetime.now(timezone.utc)
    db.add(GroomingRecord(
        id=str(uuid.uuid4()), pet_id=pet_id,
        type="bath_grooming" if cfg.with_grooming else "bath", date=now,
        location=cfg.petshop_name or getattr(last, "location", None),
        location_phone=cfg.petshop_phone or getattr(last, "location_phone", None),
        frequency_days=cfg.interval_days, next_recommended_date=now + timedelta(days=cfg.interval_days),
        last_completed_date=now,
        reminder_enabled=False,   # o aviso agora é o da rotina (evita aviso duplicado)
    ))
    db.commit()
    sync_pet_reminder(db, cfg, now)
    return _out(db, cfg, pet_id)


@router.post("/pets/{pet_id}/routine/bath/snooze", response_model=BathOut)
def bath_snooze(pet_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """"Adiar para amanhã": novo aviso amanhã, na mesma hora."""
    _require_feature()
    get_accessible_pet_or_404(db, current_user.id, pet_id)
    cfg = _get_cfg(db, pet_id)
    if cfg is None or not cfg.enabled:
        raise HTTPException(status_code=404, detail="Rotina de banho não está ligada")
    zone = _zone(cfg.tz)
    now = datetime.now(timezone.utc)
    tomorrow = _at(zone, now.astimezone(zone).date() + timedelta(days=1),
                   cfg.time if _valid_time(cfg.time or "") else "10:00")
    for r in _pending(db, pet_id):
        db.delete(r)
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    title, body = _title_body(getattr(pet, "name", None), bool(cfg.with_grooming))
    db.add(Reminder(user_id=cfg.user_id, pet_id=pet_id, type=BATH_TYPE, title=title, body=body,
                    remind_at=tomorrow.astimezone(timezone.utc)))
    db.commit()
    return _out(db, cfg, pet_id)
