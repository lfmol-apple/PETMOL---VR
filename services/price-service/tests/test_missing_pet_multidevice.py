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


def test_push_case_notifies_all_participants_except_confirmer(_isolate, monkeypatch):
    sent = _isolate
    from src.missing_pets import _push_case
    monkeypatch.setattr(mp_mod, "_load_mp_notified", lambda: {"MP_ID": {"notified": ["regionUser"]}})

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
        participants = _case_participant_user_ids(db, mp, include_region=True)
        _push_case(participants, {"title": "x", "body": "y"}, exclude={"owner"})

    # dono confirmou -> não recebe; todos os outros participantes recebem 1x
    assert set(sent) == {
        "https://push.example/finder-dev",
        "https://push.example/follower-dev",
        "https://push.example/region-dev",
    }


def test_mark_found_is_idempotent(_isolate, monkeypatch):
    """2 PATCH /found (dois botões + toque duplo) não re-disparam o push."""
    sent = _isolate
    monkeypatch.setattr(mp_mod, "_ensure_missing_pet_access", lambda *a, **k: None)
    monkeypatch.setattr(mp_mod, "_load_mp_notified", lambda: {"MP_ID": {"notified": ["regionUser"]}})

    class _U:
        id = "owner"

    with SessionLocal() as db:
        _sub(db, "regionUser", "region-dev")
        db.add(MissingPet(
            id="MP_ID", user_id="owner", pet_id=None, pet_name="Rex", contact="x",
            status="found", current_radius_km=2.0,
        ))
        db.commit()
        db2 = SessionLocal()
        try:
            out = mark_found("MP_ID", db=db2, current_user=_U())
        finally:
            db2.close()

    assert out == {"status": "found"}
    assert sent == []  # já estava "found" -> nenhum push


# ── PS-4: novo ponto de interesse (avistamento) ─────────────────────────────

def test_sighting_broadcast_reaches_new_area_and_not_owner(_isolate):
    sent = _isolate
    with SessionLocal() as db:
        # dono no ponto original; um usuário longe do original mas perto do
        # avistamento; um usuário longe de tudo
        _sub(db, "owner", "owner-dev", lat=0.0, lng=0.0)
        _sub(db, "newArea", "newarea-dev", lat=10.0, lng=10.0)
        _sub(db, "elsewhere", "elsewhere-dev", lat=-20.0, lng=-20.0)
        mp = _make_mp(db, owner_id="owner", lat=0.0, lng=0.0, radius=2.0)
        n = _broadcast_missing_pet(
            mp, center=(10.0, 10.0), radius_km=5.0, origin="sighting",
        )

    assert sent == ["https://push.example/newarea-dev"]
    assert n == 1


def test_sighting_broadcast_does_not_exclude_already_notified(_isolate, monkeypatch):
    sent = _isolate
    # "u1" já foi notificado do alerta original
    monkeypatch.setattr(mp_mod, "_load_mp_notified", lambda: {"MP": {"notified": ["u1"]}})
    with SessionLocal() as db:
        _sub(db, "u1", "u1-dev", lat=10.0, lng=10.0)
        mp = MissingPet(
            id="MP", user_id="owner", pet_id=None, pet_name="Rex", contact="x",
            lat=0.0, lng=0.0, current_radius_km=2.0, status="active",
        )
        db.add(mp)
        db.commit()
        # initial: u1 é excluído (já notificado)
        assert _broadcast_missing_pet(mp) == 0
        sent.clear()
        # sighting: u1 recebe de novo, é a região nova
        assert _broadcast_missing_pet(mp, center=(10.0, 10.0), radius_km=5.0, origin="sighting") == 1
    assert sent == ["https://push.example/u1-dev"]


# ── PS-5: raio livre pela velocidade de caminhada ──────────────────────────

def test_effective_radius_grows_with_time_no_cap(_isolate):
    from datetime import datetime, timezone, timedelta
    from src.missing_pets import _effective_radius_km

    class _MP:
        current_radius_km = 2.0
        species = "dog"
        missing_date = None
        missing_time = None
        created_at = datetime.now(timezone.utc) - timedelta(hours=40)

    # 40h * 5 km/h = 200 km — sem teto (antes era limitado a 50)
    assert _effective_radius_km(_MP()) >= 200

    class _Cat(_MP):
        species = "cat"
        created_at = datetime.now(timezone.utc) - timedelta(hours=40)

    # gato anda menos: 40h * 3 = 120
    r = _effective_radius_km(_Cat())
    assert 118 <= r <= 125


def test_effective_radius_floor_is_stored_value(_isolate):
    from datetime import datetime, timezone, timedelta
    from src.missing_pets import _effective_radius_km

    class _MP:
        current_radius_km = 30.0
        species = "dog"
        missing_date = None
        missing_time = None
        created_at = datetime.now(timezone.utc) - timedelta(minutes=2)

    # recém-criado: nunca abaixo do valor guardado, nunca abaixo de 2
    assert _effective_radius_km(_MP()) == 30.0


def test_should_sighting_broadcast_throttle(_isolate, monkeypatch):
    from src.missing_pets import _should_sighting_broadcast, _mark_sighting_broadcast
    store: dict = {}
    monkeypatch.setattr(mp_mod, "_load_mp_notified", lambda: store)
    monkeypatch.setattr(mp_mod, "_save_mp_notified", lambda d: store.update(d))
    assert _should_sighting_broadcast("case-x") is True
    _mark_sighting_broadcast("case-x")
    assert _should_sighting_broadcast("case-x") is False


# ── PS-6: anti-golpe ────────────────────────────────────────────────────────

def test_finder_identity_payload_never_says_trusted(_isolate):
    from src.missing_pets import _finder_identity_payload
    authed = _finder_identity_payload("user-123")
    anon = _finder_identity_payload(None)
    assert authed["finder_identity"] == "petmol_user"
    assert anon["finder_identity"] == "unverified"
    for p in (authed, anon):
        low = p["finder_identity_label"].lower()
        assert "confiáv" not in low and "seguro" not in low and "verificado" not in low.replace("não verificado", "")


def test_rate_limit_blocks_after_max(_isolate):
    from src.missing_pets import _enforce_rate_limit
    from fastapi import HTTPException

    class _Req:
        headers = {"X-Forwarded-For": "9.9.9.9"}
        client = None

    req = _Req()
    for _ in range(3):
        _enforce_rate_limit(req, "unit-bucket", max_requests=3, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        _enforce_rate_limit(req, "unit-bucket", max_requests=3, window_seconds=60)
    assert exc.value.status_code == 429
    # IP diferente não é afetado
    class _Req2(_Req):
        headers = {"X-Forwarded-For": "8.8.8.8"}
    _enforce_rate_limit(_Req2(), "unit-bucket", max_requests=3, window_seconds=60)
