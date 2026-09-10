"""Pet Sumido — alerta atrasado para quem estava deslogado no broadcast.

Um vizinho que só abre o app depois do push comunitário nunca era avisado.
Ao (re)inscrever a subscription com localização, o alerta que faltou deve chegar.
"""
import uuid

import pytest

from src.db import SessionLocal, Base, engine
from src.notifications import PushSubscription
import src.notifications as notif
import src.missing_pets as mp_mod
from src.missing_pets import MissingPet, FoundReport, catch_up_missing_pet_alerts_for_user


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    Base.metadata.create_all(bind=engine)
    store: dict = {}

    def _save(d):
        store.clear()
        store.update(d)

    monkeypatch.setattr(mp_mod, "_load_mp_notified", lambda: {k: dict(v) for k, v in store.items()})
    monkeypatch.setattr(mp_mod, "_save_mp_notified", _save)
    sent = []

    def fake_send(subscription, payload):
        sent.append(subscription.get("endpoint", ""))
        return (True, False)

    monkeypatch.setattr(notif, "_send_push", fake_send)
    yield sent
    with SessionLocal() as db:
        db.query(PushSubscription).delete()
        db.query(MissingPet).delete()
        db.query(FoundReport).delete()
        db.commit()


def _mp(db, lat, lng, owner=None, radius=5.0):
    mp = MissingPet(
        id=str(uuid.uuid4()), user_id=owner, pet_id=None, pet_name="Rex",
        contact="x", lat=lat, lng=lng, current_radius_km=radius, status="active",
        photo_url="https://x/p.jpg", missing_date="2026-09-10",
    )
    db.add(mp); db.commit()
    return mp


def _sub(db, user_id, lat, lng):
    row = PushSubscription(
        id=str(uuid.uuid4()), user_id=user_id,
        endpoint=f"https://push.example/{user_id}", p256dh="k", auth="a", lat=lat, lng=lng,
    )
    db.add(row); db.commit()


def test_catchup_sends_nearby_active_alert(_isolate):
    sent = _isolate
    with SessionLocal() as db:
        _mp(db, lat=-19.90, lng=-43.90)
        _sub(db, "vizinho", lat=-19.905, lng=-43.905)  # ~700 m

    n = catch_up_missing_pet_alerts_for_user("vizinho", -19.905, -43.905)
    assert n == 1
    assert sent == ["https://push.example/vizinho"]


def test_catchup_is_one_time(_isolate):
    sent = _isolate
    with SessionLocal() as db:
        _mp(db, lat=-19.90, lng=-43.90)
        _sub(db, "vizinho", lat=-19.905, lng=-43.905)

    assert catch_up_missing_pet_alerts_for_user("vizinho", -19.905, -43.905) == 1
    sent.clear()
    assert catch_up_missing_pet_alerts_for_user("vizinho", -19.905, -43.905) == 0
    assert sent == []


def test_catchup_skips_far_away(_isolate):
    with SessionLocal() as db:
        _mp(db, lat=-19.90, lng=-43.90, radius=5.0)
        _sub(db, "longe", lat=-20.30, lng=-44.30)  # ~55 km

    assert catch_up_missing_pet_alerts_for_user("longe", -20.30, -44.30) == 0


def test_catchup_skips_owner(_isolate):
    with SessionLocal() as db:
        _mp(db, lat=-19.90, lng=-43.90, owner="dono")
        _sub(db, "dono", lat=-19.90, lng=-43.90)

    assert catch_up_missing_pet_alerts_for_user("dono", -19.90, -43.90) == 0


def test_catchup_noop_without_location(_isolate):
    assert catch_up_missing_pet_alerts_for_user("x", None, None) == 0


def test_catchup_uses_last_known_location_from_subscription(_isolate):
    # sem lat/lng no argumento → pega da subscription mais recente
    with SessionLocal() as db:
        _mp(db, lat=-19.90, lng=-43.90)
        _sub(db, "vizinho", lat=-19.905, lng=-43.905)

    assert catch_up_missing_pet_alerts_for_user("vizinho") == 1


def test_catchup_marks_notified_even_when_push_fails(_isolate):
    # usuário SEM nenhum device — não recebe push, mas o alerta é marcado
    # (o banner vermelho é o canal garantido)
    with SessionLocal() as db:
        mp_id = _mp(db, lat=-19.90, lng=-43.90).id

    n = catch_up_missing_pet_alerts_for_user("sem_device", -19.90, -43.90)
    assert n == 1
    assert "sem_device" in store_snapshot()[mp_id]["notified"]


# helper para o teste acima ler o mp_notified mockado
def store_snapshot():
    return mp_mod._load_mp_notified()
