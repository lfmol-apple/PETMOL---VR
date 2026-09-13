"""Um cuidador convidado (PetCaretaker) precisa enxergar e poder cancelar
lembretes de um pet mesmo quando quem criou o lembrete foi o tutor (ou
outro cuidador) — senão o fluxo de "editar lembrete" do app (que primeiro
lista os antigos pra apagar, depois cria o novo) nunca encontra o antigo,
e cada edição feita por uma pessoa diferente de quem criou vira um
lembrete "fantasma" duplicado, com a data velha.
"""
from datetime import datetime, timedelta, timezone

from src.db import SessionLocal
from src.pets.caretaker_models import PetCaretaker
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def _create_user(email: str) -> tuple[str, str]:
    db = SessionLocal()
    try:
        user = User(email=email, password_hash=hash_password("secret123"), name=email)
        db.add(user)
        db.commit()
        return user.id, create_access_token(user.id)
    finally:
        db.close()


def _create_pet(owner_id: str) -> str:
    db = SessionLocal()
    try:
        pet = Pet(user_id=owner_id, name="Rex", species="dog")
        db.add(pet)
        db.commit()
        return pet.id
    finally:
        db.close()


def _add_caretaker(pet_id: str, user_id: str) -> None:
    db = SessionLocal()
    try:
        db.add(PetCaretaker(id=f"ct-{user_id}", pet_id=pet_id, user_id=user_id))
        db.commit()
    finally:
        db.close()


def _remind_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()


def test_caretaker_sees_and_cancels_reminder_created_by_owner(client):
    owner_id, owner_token = _create_user("tutor@example.com")
    caregiver_id, caregiver_token = _create_user("cuidador@example.com")
    pet_id = _create_pet(owner_id)
    _add_caretaker(pet_id, caregiver_id)

    created = client.post(
        "/notifications/reminders",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"pet_id": pet_id, "type": "vaccine", "title": "Reforço", "remind_at": _remind_at()},
    )
    assert created.status_code == 200
    reminder_id = created.json()["id"]

    listed = client.get(
        "/notifications/reminders",
        headers={"Authorization": f"Bearer {caregiver_token}"},
    )
    assert listed.status_code == 200
    assert any(r["id"] == reminder_id for r in listed.json())

    deleted = client.delete(
        f"/notifications/reminders/{reminder_id}",
        headers={"Authorization": f"Bearer {caregiver_token}"},
    )
    assert deleted.status_code == 200

    listed_again = client.get(
        "/notifications/reminders",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert not any(r["id"] == reminder_id for r in listed_again.json())


def test_unrelated_user_cannot_see_or_cancel_reminder(client):
    owner_id, owner_token = _create_user("tutor2@example.com")
    outsider_id, outsider_token = _create_user("estranho@example.com")
    pet_id = _create_pet(owner_id)

    created = client.post(
        "/notifications/reminders",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"pet_id": pet_id, "type": "vaccine", "title": "Reforço", "remind_at": _remind_at()},
    )
    reminder_id = created.json()["id"]

    listed = client.get(
        "/notifications/reminders",
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert not any(r["id"] == reminder_id for r in listed.json())

    deleted = client.delete(
        f"/notifications/reminders/{reminder_id}",
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert deleted.status_code == 404
