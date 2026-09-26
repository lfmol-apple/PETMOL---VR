"""Pet Sumido — "Características únicas — só você sabe" nunca sai para quem não é dono.

Reproduzido 26/09/2026: o texto do campo aparecia no cartaz compartilhado e
voltava sem login em GET /missing-pets/public/{slug}, GET /missing-pets e
/match-photo — e em /my-alerts para qualquer pessoa no raio. O tutor pode
escrever ali um detalhe secreto de verificação; golpista leria. Decisão do
dono: privado de verdade. Continua disponível para o dono e para a IA que
compara as fotos.
"""
import types
import uuid

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.db import SessionLocal, Base, engine
import src.missing_pets as mp_mod
from src.missing_pets import MissingPet

client = TestClient(app)

SECRET = "cicatriz em forma de L na barriga"


@pytest.fixture(autouse=True)
def _clean():
    Base.metadata.create_all(bind=engine)
    yield
    with SessionLocal() as db:
        db.query(MissingPet).delete()
        db.commit()


def _mk_alert(**extra) -> MissingPet:
    fields = dict(
        id=str(uuid.uuid4()), user_id="owner", pet_id=None,
        pet_name="Rex", contact="11999990000", status="active",
        current_radius_km=2.0, characteristics=SECRET,
        public_slug=f"rex-{uuid.uuid4().hex[:6]}",
        last_seen_location="Rua das Flores, 123, Vila Mariana, São Paulo",
        lat=-23.5891, lng=-46.6388,
    )
    fields.update(extra)
    with SessionLocal() as db:
        mp = MissingPet(**fields)
        db.add(mp)
        db.commit()
        db.refresh(mp)
        db.expunge(mp)
        return mp


def test_public_slug_page_does_not_return_characteristics():
    mp = _mk_alert()
    resp = client.get(f"/missing-pets/public/{mp.public_slug}")
    assert resp.status_code == 200
    assert "characteristics" not in resp.json()
    assert SECRET not in resp.text


def test_public_list_does_not_return_characteristics():
    _mk_alert()
    resp = client.get("/missing-pets?include_found=true")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    for item in items:
        assert "characteristics" not in item
    assert SECRET not in resp.text


def test_match_photo_does_not_return_characteristics_but_ai_still_gets_them(monkeypatch):
    _mk_alert(photo_url="pets/rex.jpg")
    seen: list = []
    monkeypatch.setattr(mp_mod, "_assess_finder_photos_quality", lambda _photos: {"ok": True})

    def _fake_analyze(_photo_url, _finder_photos, characteristics=None):
        seen.append(characteristics)
        return 90, "compatível"

    monkeypatch.setattr(mp_mod, "_analyze_photo_compatibility", _fake_analyze)

    resp = client.post(
        "/missing-pets/match-photo",
        json={"finder_photos": ["aGVsbG8="], "lat": -23.5891, "lng": -46.6388, "radius_km": 30},
    )
    assert resp.status_code == 200
    matches = resp.json().get("matches", [])
    assert len(matches) >= 1
    for item in matches:
        assert "characteristics" not in item
    assert SECRET not in resp.text
    # A IA de comparação continua recebendo o texto do tutor.
    assert seen == [SECRET]


def test_my_alerts_for_nearby_stranger_does_not_return_characteristics(monkeypatch):
    mp = _mk_alert()
    monkeypatch.setattr(mp_mod, "catch_up_missing_pet_alerts_for_user", lambda *_a, **_k: None)
    monkeypatch.setattr(mp_mod, "_load_mp_notified", lambda: {mp.id: {"notified": ["stranger"]}})
    with SessionLocal() as db:
        items = mp_mod.my_alerts(db=db, current_user=types.SimpleNamespace(id="stranger"))
    assert [i["id"] for i in items] == [mp.id]
    assert "characteristics" not in items[0]
    # O contato continua (é o que o achador usa pra falar com o tutor).
    assert items[0]["contact"] == "11999990000"


def test_owner_views_keep_characteristics():
    mp = _mk_alert()
    with SessionLocal() as db:
        row = db.query(MissingPet).get(mp.id)
        assert mp_mod._mp_to_dict(row)["characteristics"] == SECRET


def test_status_token_holder_sees_own_characteristics():
    mp = _mk_alert(access_token="tok-" + uuid.uuid4().hex, reporter_type="public", user_id=None)
    resp = client.get(f"/missing-pets/status/{mp.access_token}")
    assert resp.status_code == 200
    assert resp.json()["missing_pet"]["characteristics"] == SECRET


def test_ai_prompt_forbids_echoing_characteristics_to_finder():
    prompt = mp_mod._pet_match_prompt(1, SECRET)
    assert SECRET in prompt  # a IA recebe o texto...
    assert "SIGILOSO" in prompt and "NUNCA cite" in prompt  # ...mas é proibida de repeti-lo
