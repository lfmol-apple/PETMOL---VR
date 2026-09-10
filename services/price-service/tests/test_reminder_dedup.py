"""send_due_reminders — um lembrete ANTIGO herdado (título/deep-link em
formato velho) não pode virar um 2º push junto do novo, para os tipos em
que o `type` já é a identidade por pet.
"""
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from src.db import SessionLocal, Base, engine
import src.notifications as notif
from src.notifications import Reminder, PushSubscription


@pytest.fixture(autouse=True)
def _iso(monkeypatch):
    Base.metadata.create_all(bind=engine)
    sent = []
    monkeypatch.setattr(notif, "_send_push", lambda sub, payload: (sent.append(payload) or (True, False)))
    monkeypatch.setattr(notif, "apns_configured", lambda: False)
    yield sent


def _sub(db, user_id):
    db.add(PushSubscription(
        id=str(uuid.uuid4()), user_id=user_id,
        endpoint=f"https://push.example/{user_id}", p256dh="k", auth="a",
    ))
    db.commit()


def _rem(db, user_id, pet_id, rtype, title, remind_at, created_at):
    r = Reminder(
        id=str(uuid.uuid4()), user_id=user_id, pet_id=pet_id, type=rtype,
        title=title, remind_at=remind_at, sent=False, created_at=created_at,
    )
    db.add(r)
    db.commit()
    return r.id


def test_grooming_stale_plus_fresh_sends_only_one(_iso):
    sent = _iso
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    with SessionLocal() as db:
        _sub(db, uid)
        # antigo (título/formato velho) criado há 30 dias
        old_id = _rem(db, uid, pid, "grooming", "Tosa: Rex",
                      past, past - timedelta(days=30))
        # novo, criado agora, título atual
        new_id = _rem(db, uid, pid, "grooming", "✂️ Tosa: Rex",
                      past, datetime.now(timezone.utc))

    notif.send_due_reminders()

    assert len(sent) == 1  # só um push
    with SessionLocal() as db:
        assert db.query(Reminder).get(old_id).sent is True   # consumido, sem push
        assert db.query(Reminder).get(new_id).sent is True


def test_native_user_gets_only_apns_not_web(_iso, monkeypatch):
    """Usuário com token nativo ativo: lembrete só por APNs, nunca também
    Web Push (senão chega 2x — app nativo + PWA)."""
    sent_web = _iso
    apns_calls = []
    monkeypatch.setattr(notif, "apns_configured", lambda: True)
    monkeypatch.setattr(notif, "send_apns", lambda tok, payload: (apns_calls.append(tok) or (True, False)))

    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        _sub(db, uid)  # subscription WEB (PWA)
        db.add(notif.NativePushToken(id=str(uuid.uuid4()), user_id=uid, platform="ios", token="ios-tok"))
        db.commit()
        _rem(db, uid, pid, "dewormer", "🪱 Vermífugo", now - timedelta(minutes=1), now)

    notif.send_due_reminders()

    assert apns_calls == ["ios-tok"]   # foi por APNs
    assert sent_web == []              # NÃO foi por Web Push


def test_two_vaccines_different_dates_both_send(_iso):
    """vacina NÃO colapsa por (user,pet,type) — datas diferentes = eventos diferentes."""
    sent = _iso
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        _sub(db, uid)
        _rem(db, uid, pid, "vaccine", "V8", now - timedelta(minutes=2), now)
        _rem(db, uid, pid, "vaccine", "Antirrábica", now - timedelta(minutes=1), now)

    notif.send_due_reminders()
    assert len(sent) == 2
