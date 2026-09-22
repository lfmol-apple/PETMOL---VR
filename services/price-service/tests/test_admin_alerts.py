"""Avisos ao admin: conta criada (local, gênero provável, pet) e 1º pet."""
from src.admin_alerts import (
    _notify_account_created,
    _notify_first_pet,
    first_name,
    guess_gender,
)


def test_guess_gender_by_first_name():
    assert guess_gender("Maria") == "feminino"
    assert guess_gender("Beatriz") == "feminino"
    assert guess_gender("Kelly") == "feminino"
    assert guess_gender("João") == "masculino"
    assert guess_gender("Leonardo") == "masculino"
    assert guess_gender("Rafael") == "masculino"
    assert guess_gender("Luca") == "masculino"   # termina em 'a' mas é masculino
    assert guess_gender("Alex") is None          # ambíguo: não chuta
    assert guess_gender("") is None


def test_first_name_capitalizes_first_word():
    assert first_name("  márcia  silva ") == "Márcia"
    assert first_name(None) == ""


def _setup(db, monkeypatch):
    from src.config import get_settings
    from src.user_auth.models import User

    admin_email = get_settings().admin_master_email.lower()
    admin = db.query(User).filter(User.email == admin_email).first()
    if not admin:
        admin = User(email=admin_email, password_hash="x", name="Admin")
        db.add(admin)
        db.commit()
    sent = []
    monkeypatch.setattr("src.notifications.push_to_user", lambda uid, payload: sent.append((uid, payload)))
    return admin, sent


def test_account_created_push_without_pet(monkeypatch):
    from uuid import uuid4

    from src.db import SessionLocal
    from src.user_auth.models import User

    db = SessionLocal()
    try:
        admin, sent = _setup(db, monkeypatch)
        admin_id = str(admin.id)
        u = User(email=f"{uuid4().hex[:8]}@t.com", password_hash="x", name="Márcia Souza", city="Contagem", state="MG")
        db.add(u)
        db.commit()
        _notify_account_created(str(u.id), None)
    finally:
        db.close()
    assert len(sent) == 1
    uid, payload = sent[0]
    assert uid == admin_id
    assert payload["title"] == "👤 Conta criada: Márcia"
    assert "Contagem, MG" in payload["body"]
    assert "feminino" in payload["body"]
    assert "ainda sem pet" in payload["body"]
    assert payload["data"]["url"] == "/admin/accounts"


def test_first_pet_push_only_for_first_pet(monkeypatch):
    from uuid import uuid4

    from src.db import SessionLocal
    from src.pets.models import Pet
    from src.user_auth.models import User

    db = SessionLocal()
    try:
        admin, sent = _setup(db, monkeypatch)
        u = User(email=f"{uuid4().hex[:8]}@t.com", password_hash="x", name="João Lima")
        db.add(u)
        db.commit()
        db.add(Pet(user_id=u.id, name="Rex", species="dog"))
        db.commit()
        _notify_first_pet(str(u.id), "dog")
        db.add(Pet(user_id=u.id, name="Mia", species="cat"))
        db.commit()
        _notify_first_pet(str(u.id), "cat")
    finally:
        db.close()
    assert len(sent) == 1
    assert sent[0][1]["title"] == "🐾 João cadastrou o 1º pet"
    assert "cão" in sent[0][1]["body"]
