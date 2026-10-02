"""Registro de QUEM recebeu cada alerta de Pet Sumido — achado real,
02/10/2026: o dono testou um alerta (Mel) e perguntou "quem recebeu isso?",
e a resposta era "não dá pra saber" pra QUALQUER alerta (o registro antigo
era um arquivo solto no disco, apagado a cada deploy). Agora é a tabela
MissingPetNotification, consultável via endpoint admin.
"""
import uuid

import pytest

from src.admin.deps import get_current_admin, get_current_admin_or_readonly_key
from src.db import SessionLocal, Base, engine
from src.notifications import PushSubscription
import src.notifications as notif
from src.missing_pets import MissingPet, MissingPetNotification, _broadcast_missing_pet
from src.main import app
from src.pets.caretaker_models import PetCaretaker
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import hash_password


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    Base.metadata.create_all(bind=engine)

    def fake_send(subscription, payload):
        return (True, False)
    monkeypatch.setattr(notif, "_send_push", fake_send)
    yield
    with SessionLocal() as db:
        db.query(PushSubscription).delete()
        db.query(MissingPetNotification).delete()
        db.query(MissingPet).delete()
        db.query(PetCaretaker).delete()
        db.query(Pet).delete()
        db.commit()


@pytest.fixture(autouse=True)
def _admin_override():
    app.dependency_overrides[get_current_admin] = lambda: ("u", "a")
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: ("u", "a")
    yield
    app.dependency_overrides.pop(get_current_admin, None)
    app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)


def _sub(db, user_id, lat=None, lng=None):
    db.add(PushSubscription(
        id=str(uuid.uuid4()), user_id=user_id,
        endpoint=f"https://push.example/{user_id}", p256dh="k", auth="a",
        lat=lat, lng=lng,
    ))
    db.commit()


def test_broadcast_grava_registro_durável_com_motivo_por_tipo(client):
    """Nearby (geo) e cuidador/família gravam reasons diferentes — é essa
    distinção que o endpoint admin expõe."""
    with SessionLocal() as db:
        owner = User(email=f"dono.{uuid.uuid4().hex[:6]}@example.com", password_hash=hash_password("x"), name="Dono")
        caretaker_user = User(email=f"cuidador.{uuid.uuid4().hex[:6]}@example.com", password_hash=hash_password("x"), name="Cuidador")
        nearby_user = User(email=f"vizinho.{uuid.uuid4().hex[:6]}@example.com", password_hash=hash_password("x"), name="Vizinho")
        db.add_all([owner, caretaker_user, nearby_user])
        db.commit()

        pet = Pet(id=str(uuid.uuid4()), user_id=owner.id, name="Mel", species="dog")
        db.add(pet)
        db.add(PetCaretaker(id=str(uuid.uuid4()), pet_id=pet.id, user_id=caretaker_user.id))
        db.commit()

        _sub(db, nearby_user.id, lat=-19.90, lng=-43.90)
        # cuidador LONGE do alerta (fora do raio de 2km) — não bate no filtro
        # geo, mas é notificado de qualquer jeito pela checagem dedicada de
        # cuidadores/família (sem filtro geo, ver _broadcast_missing_pet).
        _sub(db, caretaker_user.id, lat=10.0, lng=10.0)

        mp = MissingPet(
            id=str(uuid.uuid4()), user_id=owner.id, pet_id=pet.id, pet_name="Mel",
            contact="x", lat=-19.90, lng=-43.90, current_radius_km=2.0, status="active",
        )
        db.add(mp)
        db.commit()
        mp_id = mp.id

        sent = _broadcast_missing_pet(mp)
        assert sent == 2

        rows = db.query(MissingPetNotification).filter_by(missing_pet_id=mp_id).all()
        by_user = {r.user_id: r.reason for r in rows}
        assert by_user[nearby_user.id] == "nearby"
        assert by_user[caretaker_user.id] == "caretaker_or_family"

    # Endpoint admin: a mesma informação, consultável depois do fato —
    # exatamente a pergunta real ("quem recebeu o alerta da Mel?").
    r = client.get(f"/v1/admin/missing-pets/{mp_id}/recipients")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pet_name"] == "Mel"
    assert body["total"] == 2
    emails = {row["email"] for row in body["recipients"]}
    assert emails == {nearby_user.email, caretaker_user.email}
    reasons = {row["reason"] for row in body["recipients"]}
    assert reasons == {"nearby", "caretaker_or_family"}


def test_endpoint_404_pra_alerta_inexistente(client):
    r = client.get(f"/v1/admin/missing-pets/{uuid.uuid4()}/recipients")
    assert r.status_code == 404


def test_endpoint_lista_vazia_quando_ninguem_foi_notificado(client):
    with SessionLocal() as db:
        mp = MissingPet(
            id=str(uuid.uuid4()), user_id=None, pet_id=None, pet_name="Solitário",
            contact="x", status="active", current_radius_km=2.0,
        )
        db.add(mp)
        db.commit()
        mp_id = mp.id

    r = client.get(f"/v1/admin/missing-pets/{mp_id}/recipients")
    assert r.status_code == 200
    assert r.json() == {"missing_pet_id": mp_id, "pet_name": "Solitário", "total": 0, "recipients": []}
