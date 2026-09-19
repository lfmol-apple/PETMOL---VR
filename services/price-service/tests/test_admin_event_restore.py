"""Restaurar evento soft-deletado (medicação, vacina etc.) via admin.

Soft-delete (Event.deleted_at) sempre existiu pra eventos, mas não havia
como desfazer uma exclusão sem acesso direto ao banco. 19/09/2026, pedido
do dono: restaurar uma medicação apagada por engano."""
from datetime import datetime, timedelta, timezone

from src.admin.models import AdminUser
from src.db import SessionLocal
from src.events.models import Event
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

NOW = datetime.now(timezone.utc)


def _admin_headers():
    db = SessionLocal()
    try:
        u = User(email="leonardofmol@gmail.com", password_hash=hash_password("x"), name="Admin")
        db.add(u)
        db.commit()
        db.add(AdminUser(user_id=u.id, role="master"))
        db.commit()
        return {"Authorization": f"Bearer {create_access_token(u.id)}"}
    finally:
        db.close()


def _seed_deleted_medication():
    db = SessionLocal()
    try:
        owner = User(email="tutor@example.com", password_hash=hash_password("x"), name="Tutor")
        db.add(owner)
        db.commit()

        pet = Pet(user_id=owner.id, name="Baby", species="dog")
        db.add(pet)
        db.commit()

        ev = Event(
            user_id=owner.id, pet_id=pet.id, type="medicacao", status="active",
            title="Ácido Ursodesoxicólico (Ursacol) 120 mg",
            scheduled_at=NOW - timedelta(days=200),
            deleted_at=NOW - timedelta(hours=1),
        )
        db.add(ev)
        db.commit()
        return ev.id
    finally:
        db.close()


def test_restore_requires_admin(client):
    ev_id = _seed_deleted_medication()
    assert client.post(f"/v1/admin/events/{ev_id}/restore").status_code == 401


def test_restore_clears_deleted_at(client):
    headers = _admin_headers()
    ev_id = _seed_deleted_medication()

    r = client.post(f"/v1/admin/events/{ev_id}/restore", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Ácido Ursodesoxicólico (Ursacol) 120 mg"

    db = SessionLocal()
    try:
        ev = db.query(Event).filter(Event.id == ev_id).first()
        assert ev.deleted_at is None
    finally:
        db.close()


def test_restore_404_for_unknown_event(client):
    headers = _admin_headers()
    r = client.post("/v1/admin/events/does-not-exist/restore", headers=headers)
    assert r.status_code == 404


def test_restore_400_when_not_deleted(client):
    headers = _admin_headers()
    ev_id = _seed_deleted_medication()
    # já restaurado uma vez — a 2ª tentativa não é "não deletado", é idempotência
    client.post(f"/v1/admin/events/{ev_id}/restore", headers=headers)
    r = client.post(f"/v1/admin/events/{ev_id}/restore", headers=headers)
    assert r.status_code == 400
