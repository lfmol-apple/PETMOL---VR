"""POST /missing-pets/{id}/report-found — bug real (18/09/2026): a exigência
de vídeo+prova era incondicional no backend, mas o frontend só oferece essa
etapa quando o achador confirma que está com o pet fisicamente
(has_possession=True). Quem só avistou ("visto no local") ou reportou pelo
mini-formulário do PetCard (nunca oferece vídeo) batia nesse 422 sempre —
o botão "Enviar aviso para o tutor" nunca funcionava pra esses casos."""
import uuid

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.db import SessionLocal, Base, engine
from src.notifications import PushSubscription
import src.notifications as notif
import src.missing_pets as mp_mod
from src.missing_pets import MissingPet, FoundReport

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    Base.metadata.create_all(bind=engine)
    sent = []

    def fake_send(subscription, payload):
        sent.append((subscription.get("endpoint", ""), payload))
        return True, False

    monkeypatch.setattr(notif, "_send_push", fake_send)
    monkeypatch.setattr(mp_mod, "_save_found_report_video", lambda _data: "/uploads/found_videos/test.mp4")
    monkeypatch.setattr(mp_mod, "_validate_proof_challenge", lambda *_args, **_kwargs: (True, []))
    yield sent
    with SessionLocal() as db:
        db.query(PushSubscription).delete()
        db.query(FoundReport).delete()
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


def _sub(user_id: str, tag: str):
    with SessionLocal() as db:
        db.add(PushSubscription(
            id=str(uuid.uuid4()),
            user_id=user_id,
            endpoint=f"https://push.example/{tag}",
            p256dh="k",
            auth="a",
        ))
        db.commit()


def test_sighting_without_possession_never_needs_video():
    mp_id = _mk_alert()
    r = client.post(f"/missing-pets/{mp_id}/report-found", json={
        "finder_contact": "(11) 99999-8888",
        "has_possession": False,
    })
    assert r.status_code == 201
    assert r.json()["status"] == "reported"
    with SessionLocal() as db:
        assert db.query(FoundReport).filter_by(missing_pet_id=mp_id).count() == 1


def test_report_found_notifies_owner_immediately(_clean):
    sent = _clean
    mp_id = _mk_alert()
    _sub("owner", "owner-dev")

    r = client.post(f"/missing-pets/{mp_id}/report-found", json={
        "finder_contact": "(11) 99999-0000",
        "has_possession": False,
    })

    assert r.status_code == 201
    assert "tutor" in r.json()["message"].lower()
    assert [endpoint for endpoint, _payload in sent] == ["https://push.example/owner-dev"]


def test_updating_report_with_video_notifies_owner_again(_clean):
    sent = _clean
    mp_id = _mk_alert()
    _sub("owner", "owner-dev")

    first = client.post(f"/missing-pets/{mp_id}/report-found", json={
        "finder_contact": "(11) 99999-0001",
        "has_possession": False,
    })
    assert first.status_code == 201
    sent.clear()

    again = client.post(f"/missing-pets/{mp_id}/report-found", json={
        "finder_contact": "(11) 99999-0001",
        "has_possession": True,
        "finder_video": "data:video/mp4;base64,aGVsbG8=",
        "proof_challenge_id": "proof-1",
        "proof_challenge": "mostre o pet",
    })

    assert again.status_code == 201
    assert again.json()["status"] == "updated_existing_report"
    assert [endpoint for endpoint, _payload in sent] == ["https://push.example/owner-dev"]


def test_petcard_report_without_has_possession_field_never_needs_video():
    """PetCard (mini-formulário na lista) nunca manda has_possession —
    clientes antigos/esse caminho caem no default None, que não deve
    bloquear (mesmo comportamento de False)."""
    mp_id = _mk_alert()
    r = client.post(f"/missing-pets/{mp_id}/report-found", json={
        "finder_contact": "(11) 98888-7777",
    })
    assert r.status_code == 201


def test_claiming_possession_still_requires_video_proof():
    mp_id = _mk_alert()
    r = client.post(f"/missing-pets/{mp_id}/report-found", json={
        "finder_contact": "(11) 97777-6666",
        "has_possession": True,
    })
    assert r.status_code == 422
    assert "vídeo" in r.json()["detail"].lower()
