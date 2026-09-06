"""Pet Sumido — broadcast e /reach precisam respeitar MÚLTIPLOS dispositivos
por usuário (regressão do PR #94, reimplementado sobre o main).

Antes: `_load_subscriptions()` colapsava para 1 dispositivo por usuário, então
um tutor com celular + notebook só recebia o alerta num aparelho, e uma
subscription inválida derrubava o usuário inteiro.
"""
import uuid

import pytest

from src.db import SessionLocal, Base, engine
from src.notifications import PushSubscription
import src.notifications as notif
import src.missing_pets as mp_mod
from src.missing_pets import (
    MissingPet,
    FoundReport,
    MissingPetFollower,
    _broadcast_missing_pet,
    _case_participant_user_ids,
    mark_found,
)


def _sub(db, user_id, tag, lat=None, lng=None):
    row = PushSubscription(
        id=str(uuid.uuid4()),
        user_id=user_id,
        endpoint=f"https://push.example/{tag}",
        p256dh="k", auth="a",
        lat=lat, lng=lng,
    )
    db.add(row)
    db.commit()
    return row.id


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    Base.metadata.create_all(bind=engine)
    # não escreve o mp_notified.json real
    monkeypatch.setattr(mp_mod, "_load_mp_notified", lambda: {})
    monkeypatch.setattr(mp_mod, "_save_mp_notified", lambda _d: None)
    monkeypatch.setattr(mp_mod, "_mark_notified", lambda *_a, **_k: None)
    sent = []

    def fake_send(subscription, payload):
        endpoint = subscription.get("endpoint", "")
        sent.append(endpoint)
        # endpoint com "BAD" simula subscription expirada (410)
        return (False, True) if "BAD" in endpoint else (True, False)

    monkeypatch.setattr(notif, "_send_push", fake_send)
    yield sent
    with SessionLocal() as db:
        db.query(PushSubscription).delete()
        db.query(MissingPet).delete()
        db.query(FoundReport).delete()
        db.query(MissingPetFollower).delete()
        db.commit()


def _make_mp(db, owner_id=None, lat=None, lng=None, radius=2.0):
    mp = MissingPet(
        id=str(uuid.uuid4()), user_id=owner_id, pet_id=None,
        pet_name="Rex", contact="x", lat=lat, lng=lng,
        current_radius_km=radius, status="active",
    )
    db.add(mp)
    db.commit()
    return mp


def test_two_devices_same_user_both_receive(_isolate):
    sent = _isolate
    with SessionLocal() as db:
        _sub(db, "u1", "phone")
        _sub(db, "u1", "laptop")
        mp = _make_mp(db, owner_id="owner")
        users_notified = _broadcast_missing_pet(mp)

    assert sorted(sent) == ["https://push.example/laptop", "https://push.example/phone"]
    assert users_notified == 1  # conta USUÁRIOS, não dispositivos


def test_invalid_subscription_disables_only_that_device(_isolate):
    with SessionLocal() as db:
        good_id = _sub(db, "u1", "phone")
        bad_id = _sub(db, "u1", "BAD-laptop")
        mp = _make_mp(db, owner_id="owner")
        users_notified = _broadcast_missing_pet(mp)

    with SessionLocal() as db:
        good = db.query(PushSubscription).filter_by(id=good_id).one()
        bad = db.query(PushSubscription).filter_by(id=bad_id).one()
        assert good.disabled_at is None          # aparelho bom intacto
        assert bad.disabled_at is not None       # só o inválido desativado
    assert users_notified == 1                   # 1 aparelho ok => usuário notificado


def test_owner_never_receives(_isolate):
    sent = _isolate
    with SessionLocal() as db:
        _sub(db, "owner", "owner-phone")
        _sub(db, "u2", "u2-phone")
        mp = _make_mp(db, owner_id="owner")
        _broadcast_missing_pet(mp)
    assert sent == ["https://push.example/u2-phone"]


def test_geo_any_device_in_radius_notifies_all_devices(_isolate):
    sent = _isolate
    with SessionLocal() as db:
        # u1: um aparelho longe, um dentro do raio -> notifica os dois
        _sub(db, "u1", "far", lat=0.0, lng=0.0)
        _sub(db, "u1", "near", lat=10.0, lng=10.0)
        # u2: só longe -> não notifica
        _sub(db, "u2", "u2-far", lat=0.0, lng=0.0)
        mp = _make_mp(db, owner_id="owner", lat=10.0, lng=10.0, radius=5.0)
        users_notified = _broadcast_missing_pet(mp)

    assert set(sent) == {"https://push.example/far", "https://push.example/near"}
    assert users_notified == 1


def test_reach_counts_people_not_subscriptions(client, _isolate, monkeypatch):
    # /reach exige auth + acesso ao mp; testa a contagem direto na função
    from src.missing_pets import alert_reach
    monkeypatch.setattr(mp_mod, "_ensure_missing_pet_access", lambda *a, **k: None)

    class _U:  # stand-in de User
        id = "viewer"

    with SessionLocal() as db:
        _sub(db, "u1", "p1", lat=10.0, lng=10.0)
        _sub(db, "u1", "p2", lat=10.0, lng=10.0)   # mesmo usuário, 2 aparelhos
        _sub(db, "u2", "p3", lat=10.0, lng=10.0)
        mp = _make_mp(db, owner_id="owner", lat=10.0, lng=10.0, radius=5.0)
        db2 = SessionLocal()
        try:
            out = alert_reach(mp.id, db=db2, current_user=_U())
        finally:
            db2.close()

    # 2 pessoas no raio (u1, u2) — não 3 subscriptions
    assert out["notified_active"] + out["new_in_radius"] == 2


# ── PS-3: matriz de push ─────────────────────────────────────────────────────

def test_case_participants_dono_finder_follower(_isolate):
    with SessionLocal() as db:
        mp = _make_mp(db, owner_id="owner")
        db.add(FoundReport(
            id=str(uuid.uuid4()), missing_pet_id=mp.id,
            finder_contact="c", finder_user_id="finder1",
        ))
        db.add(MissingPetFollower(
            id=str(uuid.uuid4()), missing_pet_id=mp.id, finder_user_id="follower1",
        ))
        db.commit()
        ids = _case_participant_user_ids(db, mp)
        ids_no_finder = _case_participant_user_ids(db, mp, include_finders=False, include_followers=False)

    assert ids == {"owner", "finder1", "follower1"}
    assert ids_no_finder == {"owner"}
    assert "" not in ids and "None" not in ids


def test_mark_found_notifies_all_participants_except_confirmer(_isolate, monkeypatch):
    sent = _isolate
    monkeypatch.setattr(mp_mod, "_ensure_missing_pet_access", lambda *a, **k: None)
    # região: um usuário que recebeu o alerta original
    monkeypatch.setattr(mp_mod, "_load_mp_notified", lambda: {"MP_ID": {"notified": ["regionUser"]}})

    class _U:
        id = "owner"

    with SessionLocal() as db:
        _sub(db, "owner", "owner-dev")
        _sub(db, "finder1", "finder-dev")
        _sub(db, "follower1", "follower-dev")
        _sub(db, "regionUser", "region-dev")
        mp = MissingPet(
            id="MP_ID", user_id="owner", pet_id=None, pet_name="Rex", contact="x",
            status="active", current_radius_km=2.0,
        )
        db.add(mp)
        db.add(FoundReport(id=str(uuid.uuid4()), missing_pet_id="MP_ID", finder_contact="c", finder_user_id="finder1"))
        db.add(MissingPetFollower(id=str(uuid.uuid4()), missing_pet_id="MP_ID", finder_user_id="follower1"))
        db.commit()

        db2 = SessionLocal()
        try:
            out = mark_found("MP_ID", db=db2, current_user=_U())
        finally:
            db2.close()

    assert out == {"status": "found"}
    # dono confirmou -> não recebe; todos os outros participantes recebem 1x
    assert set(sent) == {
        "https://push.example/finder-dev",
        "https://push.example/follower-dev",
        "https://push.example/region-dev",
    }
