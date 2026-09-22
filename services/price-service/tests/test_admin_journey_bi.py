"""Jornada e Conversão — funil de aquisição completo (cohort real + drill-down)."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from src.admin.models import AdminUser
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.pets.models import Pet
from src.pets.vaccine_models import VaccineRecord
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


def _seed_funnel_cohort():
    """3 tutores, cada um indo um pouco mais longe na jornada:
    A: só conta. B: conta + pet + perfil + alimentação. C: vai até o clique."""
    db = SessionLocal()
    try:
        a = User(email=f"a-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Ana",
                 created_at=NOW - timedelta(days=2))
        b = User(email=f"b-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Beto",
                 created_at=NOW - timedelta(days=2))
        c = User(email=f"c-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Carla",
                 created_at=NOW - timedelta(days=2))
        db.add_all([a, b, c])
        db.commit()

        pet_b = Pet(user_id=b.id, name="Rex", species="dog", breed="SRD", photo="pets/rex.jpg")
        pet_c = Pet(user_id=c.id, name="Mia", species="cat", breed="SRD")
        db.add_all([pet_b, pet_c])
        db.commit()

        db.add(FeedingPlan(pet_id=pet_b.id, species="dog", country_code="BR", food_brand="Golden",
                            items_json='[{"gtin":"789"}]', daily_amount_g=200, duration_days=30, enabled=True))
        db.add(FeedingPlan(pet_id=pet_c.id, species="cat", country_code="BR", food_brand="Whiskas",
                            items_json='[{"gtin":"456"}]', daily_amount_g=80, duration_days=20, enabled=True))
        db.commit()

        # C vai até o fim: controle (vacina) + retornou + eventos de loja
        db.add(VaccineRecord(pet_id=pet_c.id, vaccine_name="V4", applied_date=NOW - timedelta(days=1),
                              next_dose_date=NOW + timedelta(days=300)))
        db.commit()

        for i, name in enumerate(["app_open"]):
            db.add(AnalyticsProductEvent(event_id=f"c-first-{uuid4().hex[:6]}", event_name=name, user_id=c.id,
                                          received_at=NOW - timedelta(days=2)))
        db.add(AnalyticsProductEvent(event_id=f"c-last-{uuid4().hex[:6]}", event_name="app_open", user_id=c.id,
                                      received_at=NOW))  # >24h depois do primeiro -> "retornou"
        for name in ("store_opened", "offer_viewed", "commerce_click"):
            db.add(AnalyticsProductEvent(event_id=f"c-{name}-{uuid4().hex[:6]}", event_name=name, user_id=c.id,
                                          received_at=NOW - timedelta(hours=1)))
        db.commit()
        return {"a": a.id, "b": b.id, "c": c.id, "pet_b": pet_b.id}
    finally:
        db.close()


def test_journey_funnel_counts_exact_cohort_progression(client):
    headers = _admin_headers()
    ids = _seed_funnel_cohort()

    r = client.get("/v1/admin/analytics/journey-funnel", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    steps = {s["key"]: s["users"] for s in body["steps"]}

    # sem período informado o cohort é TODOS os tutores — inclui a própria
    # conta admin criada por _admin_headers() (A, B, C + admin = 4)
    assert steps["account"] == 4
    assert steps["pet"] == 2          # B, C
    assert steps["profile"] == 2      # B, C (têm breed)
    assert steps["feeding"] == 2      # B, C
    assert steps["control"] == 1      # só C (vacina)
    assert steps["returned"] == 1     # só C
    assert steps["store_opened"] == 1
    assert steps["offer_viewed"] == 1
    assert steps["commerce_click"] == 1
    assert len(body["instrumentation_gaps"]) >= 3


def test_journey_funnel_respects_period_cohort_filter(client):
    headers = _admin_headers()
    _seed_funnel_cohort()

    # outro tutor criado há 40 dias — fora da janela de 7d
    db = SessionLocal()
    try:
        old = User(email=f"old-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"),
                   created_at=NOW - timedelta(days=40))
        db.add(old)
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/journey-funnel?period_days=7", headers=headers)
    body = r.json()
    # A, B, C + a própria conta admin (criada agora) — não o tutor de 40 dias atrás
    assert body["cohort_total"] == 4

    # sem period_days = "Tudo" (o parâmetro tem teto de 400 dias) — inclui o de 40 dias
    r_all = client.get("/v1/admin/analytics/journey-funnel", headers=headers)
    assert r_all.json()["cohort_total"] == 5


def test_journey_step_population_returns_tutors_with_pet_photo(client):
    headers = _admin_headers()
    ids = _seed_funnel_cohort()

    r = client.get("/v1/admin/analytics/journey-funnel/feeding/population", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    by_id = {it["user_id"]: it for it in body["items"]}
    assert ids["b"] in by_id
    assert ids["c"] in by_id
    assert by_id[ids["b"]]["pet_thumbnails"][0]["photo_url"]
    assert by_id[ids["b"]]["pet_thumbnails"][0]["name"] == "Rex"


def test_journey_step_population_unknown_step_404s(client):
    headers = _admin_headers()
    r = client.get("/v1/admin/analytics/journey-funnel/nao-existe/population", headers=headers)
    assert r.status_code == 404
