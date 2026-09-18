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
from src.missing_pets import MissingPet, FoundReport

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean():
    Base.metadata.create_all(bind=engine)
    yield
    with SessionLocal() as db:
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
