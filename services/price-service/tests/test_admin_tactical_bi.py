"""Inteligência tática: sugestões reais + decisão humana persistida (nunca
dispara push) + cards de Pets Desaparecidos/Encontrados."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from src.admin.models import AdminUser
from src.db import SessionLocal
from src.missing_pets import MissingPet, PetSighting
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


# ── missing pets summary ────────────────────────────────────────────────

def test_missing_pets_summary_distinguishes_petmol_assisted_finds(client):
    headers = _admin_headers()
    db = SessionLocal()
    try:
        active = MissingPet(pet_name="Rex", contact="x", status="active")
        found_assisted = MissingPet(pet_name="Mia", contact="x", status="found")
        found_alone = MissingPet(pet_name="Bidu", contact="x", status="found")
        db.add_all([active, found_assisted, found_alone])
        db.commit()

        # só o "found_assisted" tem um avistamento do app ligado a ele
        db.add(PetSighting(photo_urls="[]", matched_missing_pet_id=found_assisted.id))
        db.commit()
        ids = {"active": active.id, "assisted": found_assisted.id, "alone": found_alone.id}
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/missing-pets-summary", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["active"] == 1
    assert body["found_total"] == 2
    assert body["found_with_petmol_participation"] == 1  # só o "assisted"
    assert "não atribuímos mérito" in body["note"]


# ── sugestões táticas ────────────────────────────────────────────────────

def _seed_pets_without_feeding(n):
    db = SessionLocal()
    try:
        from src.pets.models import Pet

        u = User(email=f"t-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Tereza")
        db.add(u)
        db.commit()
        for i in range(n):
            db.add(Pet(user_id=u.id, name=f"Pet{i}", species="dog"))
        db.commit()
    finally:
        db.close()


def test_tactical_suggestions_generated_from_real_feeding_gap(client):
    headers = _admin_headers()
    _seed_pets_without_feeding(3)

    r = client.get("/v1/admin/analytics/tactical-suggestions", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    keys = {s["key"] for s in body["suggestions"]}
    assert "feeding_missing" in keys
    feeding_sugg = next(s for s in body["suggestions"] if s["key"] == "feeding_missing")
    assert feeding_sugg["audience_size"] >= 3
    assert feeding_sugg["decision"] is None  # nenhuma decisão ainda
    assert "não existe" not in feeding_sugg["body"]  # não é texto de lacuna, é sugestão real
    assert "nenhum push é enviado" in body["note"]


def test_recording_a_decision_never_sends_push_and_persists(client):
    headers = _admin_headers()
    _seed_pets_without_feeding(2)

    r = client.post(
        "/v1/admin/analytics/tactical-decisions/feeding_missing",
        json={"decision": "approved_for_review", "note": "olhar segmentação antes"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["decision"] == "approved_for_review"

    # a sugestão agora carrega a decisão mais recente
    r2 = client.get("/v1/admin/analytics/tactical-suggestions", headers=headers)
    feeding_sugg = next(s for s in r2.json()["suggestions"] if s["key"] == "feeding_missing")
    assert feeding_sugg["decision"]["decision"] == "approved_for_review"
    assert feeding_sugg["decision"]["decided_by"] == "leonardofmol@gmail.com"
    assert feeding_sugg["decision"]["note"] == "olhar segmentação antes"

    # decidir de novo (adiar) — fica valendo a mais recente, não duplica sentido
    r3 = client.post(
        "/v1/admin/analytics/tactical-decisions/feeding_missing",
        json={"decision": "postponed"},
        headers=headers,
    )
    assert r3.status_code == 200
    r4 = client.get("/v1/admin/analytics/tactical-suggestions", headers=headers)
    feeding_sugg2 = next(s for s in r4.json()["suggestions"] if s["key"] == "feeding_missing")
    assert feeding_sugg2["decision"]["decision"] == "postponed"


def test_invalid_decision_value_rejected(client):
    headers = _admin_headers()
    r = client.post(
        "/v1/admin/analytics/tactical-decisions/feeding_missing",
        json={"decision": "send_now"},
        headers=headers,
    )
    assert r.status_code == 422  # pydantic rejeita o padrão antes de chegar na lógica


def test_tactical_decision_requires_real_admin_jwt_not_api_key(client, monkeypatch):
    from src.config import get_settings

    monkeypatch.setattr(get_settings(), "admin_ops_api_key", "test-ops-key", raising=False)
    r = client.post(
        "/v1/admin/analytics/tactical-decisions/feeding_missing",
        json={"decision": "discarded"},
        headers={"X-Admin-Api-Key": "test-ops-key"},
    )
    # a chave de API só é aceita nos GETs (get_current_admin_or_readonly_key);
    # a escrita usa get_current_admin puro, que não conhece essa chave
    assert r.status_code == 401
