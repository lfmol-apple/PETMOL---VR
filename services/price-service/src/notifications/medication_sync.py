"""Garante, no servidor, os lembretes de remédio das próximas 36h.

Os lembretes de remédio eram criados só pelo app, um POST por dose; se algum
falhava (rede, rajada) o remédio ficava sem aviso e ninguém era avisado. Aqui o
servidor recalcula os horários a partir da própria medicação gravada (mesma
regra do app) e cria só os que faltam. Duplicatas eventuais são absorvidas no
envio (mesmo pet + mesmo minuto + mesmo remédio = um aviso)."""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_BR = ZoneInfo("America/Sao_Paulo")
_HORIZON = timedelta(hours=36)
_MED_TYPES = ("medicacao", "medication")
_MAX_CREATED_PER_RUN = 500


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _local_dt(day: date, hhmm: str) -> datetime:
    h, m = (int(x) for x in hhmm.split(":")[:2])
    return datetime(day.year, day.month, day.day, h, m, tzinfo=_BR)


def expected_slots(extra: dict, start_day: date, now_utc: datetime) -> list:
    """Horários (datetime aware) previstos entre agora e agora+36h."""
    mode = extra.get("frequency_mode")
    times = [t for t in (extra.get("reminder_times") or []) if isinstance(t, str) and ":" in t]
    first = (extra.get("first_dose_time") or "08:00")
    if not mode and times:
        mode = "vezes_dia"
    if mode in (None, "conforme_necessidade"):
        return []

    days = int(extra.get("treatment_days") or 0) or 365
    end_utc = now_utc + _HORIZON
    slots: list = []

    if mode == "dose_unica":
        slots = [_local_dt(start_day, first)]
    elif mode == "intervalo_dias":
        step = max(1, int(extra.get("custom_interval_days") or 1))
        total = max(1, min(60, int(extra.get("total_doses") or 1)))
        slots = [_local_dt(start_day + timedelta(days=step * k), first) for k in range(total)]
    elif mode == "vezes_dia":
        for d in range(days):
            day = start_day + timedelta(days=d)
            for t in (times or [first]):
                slots.append(_local_dt(day, t))
    elif mode == "intervalo":
        step_min = int(extra.get("interval_minutes") or 0)
        if step_min <= 0:
            return []
        cur = _local_dt(start_day, first)
        limit = cur + timedelta(days=days)
        while cur < limit and cur.astimezone(timezone.utc) <= end_utc:
            slots.append(cur)
            cur = cur + timedelta(minutes=step_min)
    else:
        return []

    applied_dates = set(extra.get("applied_dates") or [])
    skipped_dates = set(extra.get("skipped_dates") or [])
    applied_slots = extra.get("applied_slots") or {}
    skipped_slots = extra.get("skipped_slots") or {}
    multi = mode in ("vezes_dia", "intervalo") and (len(times) > 1 or mode == "intervalo")

    out = []
    for s in slots:
        u = s.astimezone(timezone.utc)
        if u < now_utc or u > end_utc:
            continue
        ds, hhmm = s.strftime("%Y-%m-%d"), s.strftime("%H:%M")
        if ds in skipped_dates or hhmm in (skipped_slots.get(ds) or []):
            continue
        if multi:
            if hhmm in (applied_slots.get(ds) or []):
                continue
        elif ds in applied_dates:
            continue
        out.append(s)
    return sorted(out)


def reconcile_medication_reminders(now: Optional[datetime] = None) -> int:
    """Cria os lembretes de remédio que faltam. Devolve quantos criou."""
    from ..config import get_settings
    from ..db import SessionLocal
    from ..events.models import Event
    from ..pets.models import Pet
    from . import Reminder

    if not get_settings().medications_enabled:
        return 0
    now_utc = _utc(now or datetime.now(timezone.utc))
    db = SessionLocal()
    created = 0
    try:
        events = (
            db.query(Event)
            .filter(Event.type.in_(_MED_TYPES), Event.deleted_at.is_(None), Event.status.notin_(("cancelled", "completed")))
            .all()
        )
        if not events:
            return 0
        pet_ids = {e.pet_id for e in events}
        pets = {p.id: p for p in db.query(Pet).filter(Pet.id.in_(pet_ids)).all()}
        existing = {
            (r.pet_id, _utc(r.remind_at).replace(second=0, microsecond=0), (r.title or "").strip())
            for r in db.query(Reminder).filter(
                Reminder.pet_id.in_(pet_ids),
                Reminder.type.in_(("medication", "medicacao")),
                Reminder.remind_at >= now_utc - timedelta(minutes=2),
                Reminder.remind_at <= now_utc + _HORIZON + timedelta(minutes=2),
            ).all()
        }
        for e in events:
            pet = pets.get(e.pet_id)
            if not pet:
                continue
            try:
                extra = json.loads(e.extra_data or "{}")
            except Exception:
                continue
            start_day = _utc(e.scheduled_at).astimezone(_BR).date()
            name = (e.title or "medicação").strip()
            title = f"💊 {name}"
            for slot in expected_slots(extra, start_day, now_utc):
                when = slot.astimezone(timezone.utc).replace(second=0, microsecond=0)
                if (e.pet_id, when, title) in existing:
                    continue
                db.add(Reminder(
                    user_id=str(e.user_id), pet_id=e.pet_id, type="medication", title=title,
                    body=f"Hora de dar {name} para {pet.name}. Toque para registrar a dose.",
                    remind_at=when,
                ))
                existing.add((e.pet_id, when, title))
                created += 1
                if created >= _MAX_CREATED_PER_RUN:
                    break
            if created >= _MAX_CREATED_PER_RUN:
                break
        if created:
            db.commit()
            logger.info("[med-sync] %d lembrete(s) de remédio criados no servidor", created)
        return created
    except Exception as exc:
        db.rollback()
        logger.warning("[med-sync] falhou: %s", exc)
        return 0
    finally:
        db.close()
