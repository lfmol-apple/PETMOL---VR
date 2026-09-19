"""Medicamentos desativados no PETMOL 1.0 (18/09/2026, ver
docs/MEDICAMENTOS_DESATIVADOS.md). send_due_reminders() pula lembretes
tipo 'medication'/'medicacao' sem marcar `sent` — a linha fica pendente
pra sempre no banco (nada é apagado), e outros tipos de lembrete
continuam disparando push normalmente."""
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from src.db import SessionLocal, Base, engine
import src.notifications as notif
from src.notifications import Reminder, PushSubscription
from src.config import get_settings


@pytest.fixture(autouse=True)
def _iso(monkeypatch):
    Base.metadata.create_all(bind=engine)
    sent = []
    monkeypatch.setattr(notif, "_send_push", lambda sub, payload: (sent.append(payload) or (True, False)))
    monkeypatch.setattr(notif, "apns_configured", lambda: False)
    monkeypatch.setattr(notif, "fcm_configured", lambda: False)
    yield sent
    with SessionLocal() as db:
        db.query(Reminder).delete()
        db.query(PushSubscription).delete()
        db.commit()


def _sub(db, user_id):
    db.add(PushSubscription(
        id=str(uuid.uuid4()), user_id=user_id,
        endpoint=f"https://push.example/{user_id}", p256dh="k", auth="a",
    ))
    db.commit()


def _rem(db, user_id, pet_id, rtype, title):
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    r = Reminder(
        id=str(uuid.uuid4()), user_id=user_id, pet_id=pet_id, type=rtype,
        title=title, remind_at=past, sent=False, created_at=datetime.now(timezone.utc),
    )
    db.add(r)
    db.commit()
    return r.id


def test_medications_enabled_defaults_to_false():
    assert get_settings().medications_enabled is False


def test_due_medication_reminder_is_skipped_not_deleted_not_marked_sent():
    sent = []
    with SessionLocal() as db:
        uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
        _sub(db, uid)
        med_id = _rem(db, uid, pid, "medication", "Hora de dar Amoxicilina")

    def fake_send(sub, payload):
        sent.append(payload)
        return True, False
    import src.notifications as n
    n._send_push = fake_send

    notif.send_due_reminders()

    assert sent == []  # nenhum push disparado
    with SessionLocal() as db:
        row = db.query(Reminder).filter_by(id=med_id).one()
        assert row.sent is False  # continua pendente, não apagado, não consumido


def test_other_reminder_types_keep_firing_normally(monkeypatch):
    sent = []
    monkeypatch.setattr(notif, "_send_push", lambda sub, payload: (sent.append(payload) or (True, False)))
    with SessionLocal() as db:
        uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
        _sub(db, uid)
        food_id = _rem(db, uid, pid, "food", "🛒 Comprar ração")

    notif.send_due_reminders()

    assert len(sent) == 1
    with SessionLocal() as db:
        assert db.query(Reminder).filter_by(id=food_id).one().sent is True


def test_medication_and_other_types_mixed_in_same_batch(monkeypatch):
    sent = []
    monkeypatch.setattr(notif, "_send_push", lambda sub, payload: (sent.append(payload) or (True, False)))
    with SessionLocal() as db:
        uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
        _sub(db, uid)
        med_id = _rem(db, uid, pid, "medicacao", "Hora do remédio")
        vaccine_id = _rem(db, uid, pid, "vaccine", "Vacina vencendo")

    notif.send_due_reminders()

    assert len(sent) == 1  # só a vacina
    with SessionLocal() as db:
        assert db.query(Reminder).filter_by(id=med_id).one().sent is False
        assert db.query(Reminder).filter_by(id=vaccine_id).one().sent is True
