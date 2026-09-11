"""Pet Sumido — nenhum endpoint público pode devolver lat/lng exatos.

Achado de auditoria App Store (11/09/2026): `GET /missing-pets` (lista, sem
login) e `/missing-pets/match-photo` devolviam coordenada exata do último
local visto — junto com foto e nome do pet — sem nenhum consumidor no
frontend usar essa coordenada (só `last_seen_location`, redigido a nível de
rua no cliente). Risco de privacidade sem ganho funcional (Guideline 5.1.1).
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.db import SessionLocal, Base, engine
from src.missing_pets import MissingPet

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean():
    Base.metadata.create_all(bind=engine)
    yield
    with SessionLocal() as db:
        db.query(MissingPet).delete()
        db.commit()


def _mk_alert_with_location() -> str:
    with SessionLocal() as db:
        mp = MissingPet(
            id=str(uuid.uuid4()), user_id="owner", pet_id=None,
            pet_name="Rex", contact="11999990000", status="active",
            current_radius_km=2.0,
            last_seen_location="Rua das Flores, 123, Vila Mariana, São Paulo",
            lat=-23.5891, lng=-46.6388,
        )
        db.add(mp)
        db.commit()
        return mp.id


def test_list_missing_pets_never_returns_exact_coordinates():
    _mk_alert_with_location()
    resp = client.get("/missing-pets")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    for item in items:
        assert "lat" not in item
        assert "lng" not in item
        assert "contact" not in item
        assert "user_id" not in item


def test_match_photo_result_never_returns_exact_coordinates(monkeypatch):
    mp_id = _mk_alert_with_location()
    with SessionLocal() as db:
        mp = db.query(MissingPet).get(mp_id)
        mp.photo_url = "pets/rex.jpg"
        db.commit()

    # Força o candidato a passar no filtro de qualidade + score visual, sem
    # depender de um provedor de IA real — só queremos checar o shape do
    # dicionário devolvido, não a qualidade do match em si.
    monkeypatch.setattr(
        "src.missing_pets._assess_finder_photos_quality",
        lambda _photos: {"ok": True},
    )
    monkeypatch.setattr(
        "src.missing_pets._analyze_photo_compatibility",
        lambda *_args, **_kwargs: (90, "compatível"),
    )

    resp = client.post(
        "/missing-pets/match-photo",
        json={"finder_photos": ["aGVsbG8="], "lat": -23.5891, "lng": -46.6388, "radius_km": 30},
    )
    assert resp.status_code == 200
    matches = resp.json().get("matches", [])
    assert len(matches) >= 1
    for item in matches:
        assert "lat" not in item
        assert "lng" not in item
