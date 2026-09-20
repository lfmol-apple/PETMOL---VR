"""O servidor gera os lembretes de remédio que faltam, com a mesma regra do app."""
import json
import uuid
from datetime import datetime, timezone, timedelta

from src.db import SessionLocal
from src.events.models import Event
from src.notifications import Reminder
from src.notifications.medication_sync import expected_slots, reconcile_medication_reminders
from src.pets.models import Pet


def _pet_and_event(db, extra, title="Dipirona", start="2026-09-19"):
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    db.add(Pet(id=pid, user_id=uid, name="Baby", species="dog"))
    db.commit()
    ev = Event(
        id=str(uuid.uuid4()), user_id=uid, pet_id=pid, type="medicacao", title=title, status="active",
        scheduled_at=datetime.fromisoformat(f"{start}T03:00:00+00:00"),  # 00:00 em BRT
        extra_data=json.dumps(extra),
    )
    db.add(ev)
    db.commit()
    return uid, pid, ev


def _now(day="2026-09-20", hhmm="15:00"):
    # horário local de Brasília → UTC
    return datetime.fromisoformat(f"{day}T{hhmm}:00-03:00").astimezone(timezone.utc)


def test_three_times_a_day_every_8h_over_next_36h():
    extra = {"frequency_mode": "vezes_dia", "times_per_day": 3, "first_dose_time": "08:00",
             "reminder_times": ["08:00", "16:00", "00:00"], "treatment_days": 7}
    slots = expected_slots(extra, datetime(2026, 9, 19).date(), _now())
    horas = [s.strftime("%d %H:%M") for s in slots]
    # janela 20/09 15:00 → 22/09 03:00 (BRT): de 8 em 8 horas, incluindo a meia-noite
    assert horas == ["20 16:00", "21 00:00", "21 08:00", "21 16:00", "22 00:00"]


def test_applied_and_skipped_slots_are_not_reminded():
    extra = {"frequency_mode": "vezes_dia", "times_per_day": 3, "first_dose_time": "08:00",
             "reminder_times": ["08:00", "16:00", "00:00"], "treatment_days": 7,
             "applied_slots": {"2026-09-20": ["16:00"]}, "skipped_slots": {"2026-09-21": ["00:00"]}}
    horas = [s.strftime("%d %H:%M") for s in expected_slots(extra, datetime(2026, 9, 19).date(), _now())]
    assert "20 16:00" not in horas and "21 00:00" not in horas and "21 08:00" in horas


def test_no_reminders_after_treatment_ends_or_for_as_needed():
    fim = {"frequency_mode": "vezes_dia", "reminder_times": ["08:00"], "first_dose_time": "08:00", "treatment_days": 2}
    assert expected_slots(fim, datetime(2026, 9, 10).date(), _now()) == []
    assert expected_slots({"frequency_mode": "conforme_necessidade"}, datetime(2026, 9, 19).date(), _now()) == []


def test_reconcile_creates_missing_and_never_duplicates():
    extra = {"frequency_mode": "vezes_dia", "times_per_day": 3, "first_dose_time": "08:00",
             "reminder_times": ["08:00", "16:00", "00:00"], "treatment_days": 7}
    with SessionLocal() as db:
        uid, pid, ev = _pet_and_event(db, extra)
        # o app só conseguiu criar o das 16:00 de hoje
        db.add(Reminder(id=str(uuid.uuid4()), user_id=uid, pet_id=pid, type="medication", title="💊 Dipirona",
                        body="Hora de dar Dipirona para Baby. Toque para registrar a dose.",
                        remind_at=_now(hhmm="16:00")))
        db.commit()

    criados = reconcile_medication_reminders(now=_now())
    assert criados >= 2  # faltavam ao menos 00:00 e 08:00 de amanhã
    assert reconcile_medication_reminders(now=_now()) == 0  # 2ª rodada não duplica

    with SessionLocal() as db:
        horas = sorted(r.remind_at for r in db.query(Reminder).filter(Reminder.pet_id == pid).all())
        assert len(horas) == len(set(horas))
        r = db.query(Reminder).filter(Reminder.pet_id == pid).order_by(Reminder.remind_at.desc()).first()
        assert "Hora de dar Dipirona para Baby" in r.body and r.user_id == uid


def test_reconcile_skips_cancelled_and_completed_events():
    extra = {"frequency_mode": "vezes_dia", "reminder_times": ["16:00"], "first_dose_time": "16:00", "treatment_days": 7}
    with SessionLocal() as db:
        uid, pid, ev = _pet_and_event(db, extra, title="Cancelado")
        ev.status = "cancelled"
        db.commit()
    reconcile_medication_reminders(now=_now())
    with SessionLocal() as db:
        assert db.query(Reminder).filter(Reminder.pet_id == pid).count() == 0
