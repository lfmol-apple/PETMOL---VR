"""Denúncia de alerta de pet perdido — App Store 1.2 (conteúdo gerado por usuário).

Requisito: qualquer pessoa que vê o alerta pode denunciar; 2+ denúncias de IPs
distintos derrubam o alerta na hora e ele some da lista pública."""
import uuid

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.db import SessionLocal, Base, engine
from src.missing_pets import MissingPet, MissingPetAbuseReport

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean():
    Base.metadata.create_all(bind=engine)
    yield
    with SessionLocal() as db:
        db.query(MissingPetAbuseReport).delete()
        db.query(MissingPet).delete()
        db.commit()


def _mk_alert() -> str:
    with SessionLocal() as db:
        mp = MissingPet(
            id=str(uuid.uuid4()), user_id="owner", pet_id=None,
            pet_name="Rex", contact="x", status="active", current_radius_km=2.0,
        )
        db.add(mp)
        db.commit()
        return mp.id


def test_reason_must_be_valid():
    mp_id = _mk_alert()
    r = client.post(f"/missing-pets/{mp_id}/report", json={"reason": "qualquer_coisa"})
    assert r.status_code == 400


def test_single_report_is_logged_but_does_not_hide():
    mp_id = _mk_alert()
    r = client.post(f"/missing-pets/{mp_id}/report", json={"reason": "spam", "note": "link estranho"})
    assert r.status_code == 201
    assert r.json() == {"status": "received", "hidden": False}
    with SessionLocal() as db:
        assert db.query(MissingPetAbuseReport).filter_by(missing_pet_id=mp_id).count() == 1
        assert db.query(MissingPet).filter_by(id=mp_id).one().status == "active"


def test_two_distinct_reporters_remove_the_alert(monkeypatch):
    mp_id = _mk_alert()
    import src.missing_pets as m

    current_ip = ["1.1.1.1"]
    monkeypatch.setattr(m.rate_limiter, "_get_client_ip", lambda _req: current_ip[0])

    r1 = client.post(f"/missing-pets/{mp_id}/report", json={"reason": "foto_impropria"})
    assert r1.json()["hidden"] is False
    current_ip[0] = "2.2.2.2"
    r2 = client.post(f"/missing-pets/{mp_id}/report", json={"reason": "golpe_info_falsa"})
    assert r2.json()["hidden"] is True

    with SessionLocal() as db:
        assert db.query(MissingPet).filter_by(id=mp_id).one().status == "removed"

    # some da lista pública, mesmo com include_found
    listed = client.get("/missing-pets?include_found=true").json()
    assert all(p["id"] != mp_id for p in listed)


def test_same_ip_twice_does_not_remove(monkeypatch):
    mp_id = _mk_alert()
    import src.missing_pets as m
    monkeypatch.setattr(m.rate_limiter, "_get_client_ip", lambda _req: "9.9.9.9")
    client.post(f"/missing-pets/{mp_id}/report", json={"reason": "spam"})
    client.post(f"/missing-pets/{mp_id}/report", json={"reason": "spam"})
    with SessionLocal() as db:
        assert db.query(MissingPet).filter_by(id=mp_id).one().status == "active"
