"""Painel de Alimentação e Ração — funil por estado real (não eventos) + funil
comercial por eventos reais. Cada estágio testado isoladamente e via endpoint."""
import json
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from src.admin.analytics.feeding_bi import STAGE_LABEL, feeding_stage
from src.admin.models import AdminUser
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
from src.health.models import FeedingPlan
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


# ── classificação pura ───────────────────────────────────────────────────

def test_feeding_stage_no_plan_is_sem_inicio():
    assert feeding_stage(None) == "sem_inicio"


def test_feeding_stage_deleted_counts_as_sem_inicio():
    plan = FeedingPlan(pet_id="x", species="dog", country_code="BR", deleted_at=NOW)
    assert feeding_stage(plan) == "sem_inicio"


def test_feeding_stage_started_without_brand():
    plan = FeedingPlan(pet_id="x", species="dog", country_code="BR", food_brand=None, items_json="[]")
    assert feeding_stage(plan) == "sem_produto"


def test_feeding_stage_brand_without_gtin():
    plan = FeedingPlan(pet_id="x", species="dog", country_code="BR", food_brand="Golden",
                        items_json=json.dumps([{"name": "Golden 10kg"}]))
    assert feeding_stage(plan) == "sem_correspondencia"


def test_feeding_stage_gtin_without_quantity_or_duration():
    plan = FeedingPlan(pet_id="x", species="dog", country_code="BR", food_brand="Golden",
                        items_json=json.dumps([{"barcode": "7891000100103"}]))
    assert feeding_stage(plan) == "sem_quantidade_duracao"


def test_feeding_stage_complete_but_disabled():
    plan = FeedingPlan(pet_id="x", species="dog", country_code="BR", food_brand="Golden",
                        items_json=json.dumps([{"gtin": "7891000100103"}]),
                        daily_amount_g=200, duration_days=30, enabled=False)
    assert feeding_stage(plan) == "configurado_inativo"


def test_feeding_stage_active_control():
    plan = FeedingPlan(pet_id="x", species="dog", country_code="BR", food_brand="Golden",
                        items_json=json.dumps([{"gtin": "7891000100103"}]),
                        daily_amount_g=200, duration_days=30, enabled=True)
    assert feeding_stage(plan) == "controle_ativo"


def test_feeding_stage_manual_mode_without_amount_still_counts_duration():
    """no_consumption_control=True dispensa duration_days (o tutor controla
    manualmente) — só falta quantidade pra ainda cair em 'sem_quantidade'."""
    plan = FeedingPlan(pet_id="x", species="dog", country_code="BR", food_brand="Golden",
                        items_json=json.dumps([{"gtin": "789"}]),
                        no_consumption_control=True, daily_amount_g=None, enabled=True)
    assert feeding_stage(plan) == "sem_quantidade_duracao"
    plan.daily_amount_g = 150
    assert feeding_stage(plan) == "controle_ativo"


# ── endpoint /feeding-funnel — cenário com um pet em cada estágio ─────────

def _seed_one_pet_per_stage():
    db = SessionLocal()
    try:
        tutor = User(email=f"t-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"),
                     name="Tereza", city="Belo Horizonte", state="MG")
        db.add(tutor)
        db.commit()

        specs = [
            ("SemInicio", None),
            ("SemProduto", dict(food_brand=None, items_json="[]")),
            ("SemGtin", dict(food_brand="Golden", items_json=json.dumps([{"name": "x"}]))),
            ("SemQtd", dict(food_brand="Golden", items_json=json.dumps([{"gtin": "7891"}]))),
            ("Inativo", dict(food_brand="Golden", items_json=json.dumps([{"gtin": "7891"}]),
                              daily_amount_g=200, duration_days=30, enabled=False)),
            ("Ativo", dict(food_brand="Golden", items_json=json.dumps([{"gtin": "7891"}]),
                            daily_amount_g=200, duration_days=30, enabled=True)),
        ]
        pet_ids = {}
        for name, plan_kwargs in specs:
            pet = Pet(user_id=tutor.id, name=name, species="dog", photo=f"pets/{name.lower()}.jpg" if name == "Ativo" else None)
            db.add(pet)
            db.commit()
            pet_ids[name] = pet.id
            if plan_kwargs is not None:
                db.add(FeedingPlan(pet_id=pet.id, species="dog", country_code="BR", **plan_kwargs))
                db.commit()
        return {"tutor_id": tutor.id, "pet_ids": pet_ids}
    finally:
        db.close()


def test_feeding_funnel_counts_one_pet_per_stage(client):
    headers = _admin_headers()
    _seed_one_pet_per_stage()

    r = client.get("/v1/admin/analytics/feeding-funnel", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_pets"] >= 6

    by_key = {row["key"]: row for row in body["funnel"]}
    assert by_key["sem_inicio"]["pets"] == 1
    assert by_key["sem_produto"]["pets"] == 1
    assert by_key["sem_correspondencia"]["pets"] == 1
    assert by_key["sem_quantidade_duracao"]["pets"] == 1
    assert by_key["configurado_inativo"]["pets"] == 1
    assert by_key["controle_ativo"]["pets"] == 1
    # "at_or_beyond" é cumulativo — o primeiro corte inclui todo mundo
    assert by_key["sem_inicio"]["pets_at_or_beyond"] == body["total_pets"]
    assert by_key["controle_ativo"]["pets_at_or_beyond"] == 1

    assert any("código de barras" in gap for gap in body["instrumentation_gaps"])
    # Golden é a marca em SemGtin, SemQtd, Inativo e Ativo — 4 pets
    assert next(b for b in body["top_brands"] if b["brand"] == "Golden")["pets"] == 4


def test_feeding_funnel_respects_geo_filter(client):
    headers = _admin_headers()
    ids = _seed_one_pet_per_stage()

    # outro tutor, outra cidade, também sem alimentação — não deve contar
    # quando filtramos por Belo Horizonte
    db = SessionLocal()
    try:
        other = User(email=f"o-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"),
                     name="Outro", city="Curitiba", state="PR")
        db.add(other)
        db.commit()
        db.add(Pet(user_id=other.id, name="ForaDoFiltro", species="cat"))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/feeding-funnel?city=Belo Horizonte", headers=headers)
    assert r.json()["total_pets"] == 6  # só os do tutor de BH, não o de Curitiba


def test_feeding_stage_population_returns_pet_and_tutor_with_photo(client):
    headers = _admin_headers()
    ids = _seed_one_pet_per_stage()

    r = client.get("/v1/admin/analytics/feeding-funnel/controle_ativo/population", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["pet_id"] == ids["pet_ids"]["Ativo"]
    assert row["pet_name"] == "Ativo"
    assert row["photo_url"]
    assert row["tutor_name"] == "Tereza"
    assert row["food_brand"] == "Golden"

    r2 = client.get("/v1/admin/analytics/feeding-funnel/sem_inicio/population", headers=headers)
    row2 = r2.json()["items"][0]
    assert row2["pet_name"] == "SemInicio"
    assert row2["photo_url"] is None


def test_feeding_stage_population_unknown_stage_404s(client):
    headers = _admin_headers()
    r = client.get("/v1/admin/analytics/feeding-funnel/nao-existe/population", headers=headers)
    assert r.status_code == 404


# ── funil comercial — eventos reais, sem inventar venda/comissão ─────────

def test_commerce_funnel_counts_real_events_and_flags_no_sales_integration(client):
    headers = _admin_headers()
    db = SessionLocal()
    try:
        u1 = User(email=f"c1-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"))
        u2 = User(email=f"c2-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"))
        db.add_all([u1, u2])
        db.commit()
        # u1: chegou até o clique; u2: só abriu a loja
        for uid, names in ((u1.id, ["store_opened", "offer_viewed", "commerce_click"]), (u2.id, ["store_opened"])):
            for i, name in enumerate(names):
                db.add(AnalyticsProductEvent(
                    event_id=f"{uid}-{i}-{uuid4().hex[:6]}", event_name=name, user_id=uid,
                    received_at=NOW - timedelta(hours=1),
                ))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/commerce-funnel", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    steps = {s["key"]: s["users"] for s in body["steps"]}
    assert steps["store_opened"] == 2
    assert steps["offer_viewed"] == 1
    assert steps["commerce_click"] == 1
    assert body["sale_confirmed"] is None
    assert body["commission_confirmed"] is None
    assert "não disponível" in body["note"]
