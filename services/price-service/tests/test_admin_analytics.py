"""Mission Control BI — admin analytics endpoints (Fase A + B)."""
import json
from datetime import datetime, timedelta, timezone

from src.admin.models import AdminUser
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.pets.models import Pet
from src.pets.parasite_models import ParasiteControlRecord
from src.pets.vaccine_models import VaccineRecord
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

NOW = datetime.now(timezone.utc)


def _admin_headers() -> str:
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


def _seed():
    """2 tutors. Tutor A: 2 pets, one with active feeding + fresh vaccine,
    one bare. Tutor B: no pet."""
    db = SessionLocal()
    try:
        a = User(email="a@example.com", password_hash=hash_password("x"), name="Ana",
                 city="Belo Horizonte", state="MG", created_at=NOW - timedelta(days=3))
        b = User(email="b@example.com", password_hash=hash_password("x"), name="Bea",
                 created_at=NOW - timedelta(days=40))
        db.add_all([a, b])
        db.commit()

        p1 = Pet(user_id=a.id, name="Rex", species="dog", breed="SRD",
                 birth_date=datetime(2020, 1, 1).date(), sex="male",
                 weight_value=12.0, weight_unit="kg", photo="data:image/png;base64,AAAA")
        p2 = Pet(user_id=a.id, name="Mimi", species="cat")  # incomplete on purpose
        db.add_all([p1, p2])
        db.commit()

        db.add(FeedingPlan(pet_id=p1.id, species="dog", country_code="BR",
                           food_brand="Golden", package_size_kg=10.0, daily_amount_g=200,
                           duration_days=50, enabled=True, mode="kibble",
                           updated_at=NOW - timedelta(days=5)))
        db.add(VaccineRecord(pet_id=p1.id, vaccine_name="V10",
                             applied_date=NOW - timedelta(days=10),
                             next_dose_date=NOW + timedelta(days=300)))
        db.add(ParasiteControlRecord(pet_id=p1.id, type="flea_tick", product_name="NexGard",
                                     date_applied=NOW - timedelta(days=5),
                                     next_due_date=NOW + timedelta(days=25), frequency_days=30))
        db.commit()

        for i, name in enumerate(
            ["app_open", "store_opened", "offer_viewed", "commerce_click", "screen_view"]
        ):
            db.add(AnalyticsProductEvent(
                event_id=f"e{i}", event_name=name, user_id=a.id,
                anonymous_id="anon-a", session_id="sess-a",
                platform="web", app_version="unknown" if i % 2 else "abc123",
                received_at=NOW - timedelta(hours=2),
                occurred_at=NOW - timedelta(hours=2),
                properties_json=json.dumps({"merchant": "cobasi"}) if name in ("offer_viewed", "commerce_click") else None,
            ))
        db.commit()
        return {"tutor_a": a.id, "tutor_b": b.id, "pet_full": p1.id, "pet_bare": p2.id}
    finally:
        db.close()


# ── auth ────────────────────────────────────────────────────────────────────

def test_analytics_requires_admin(client):
    for path in ("/v1/admin/analytics/overview", "/v1/admin/analytics/users",
                 "/v1/admin/analytics/features", "/v1/admin/analytics/data-quality"):
        assert client.get(path).status_code == 401


# ── overview ────────────────────────────────────────────────────────────────

def test_overview_counts_users_pets_and_engagement(client):
    headers = _admin_headers()
    ids = _seed()
    r = client.get("/v1/admin/analytics/overview", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["totals"]["users"] == 3  # admin + 2 tutors
    assert body["totals"]["pets"] == 2
    assert body["tutors"]["without_pet"] == 2  # admin + tutor B
    assert body["tutors"]["with_pet"] == 1
    assert body["tutors"]["pets_with_feeding_configured"] == 1
    assert body["engagement"]["active_users_24h"] == 1
    assert isinstance(body["series"]["new_users"], list) and len(body["series"]["new_users"]) == 30
    assert body["data_quality_headline"]["issues"]


# ── features ────────────────────────────────────────────────────────────────

def test_feature_matrix_states_and_adoption(client):
    headers = _admin_headers()
    _seed()
    r = client.get("/v1/admin/analytics/features", headers=headers)
    assert r.status_code == 200, r.text
    feats = {f["key"]: f for f in r.json()["features"]}

    assert feats["food"]["pets"] == 1
    assert feats["food"]["active"] == 1
    assert feats["food"]["never_configured"] == 1
    assert feats["vaccine"]["active"] == 1
    assert feats["flea_tick"]["active"] == 1
    # behavioural
    assert feats["store"]["users"] == 1
    assert feats["store"]["scope"] == "user"


def test_feature_population_drilldown(client):
    headers = _admin_headers()
    ids = _seed()

    r = client.get("/v1/admin/analytics/features/food/population?state=never_configured", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["pet_id"] == ids["pet_bare"]
    assert body["items"][0]["tutor_email"] == "a@example.com"

    r2 = client.get("/v1/admin/analytics/features/food/population?state=active", headers=headers)
    assert r2.json()["items"][0]["pet_id"] == ids["pet_full"]

    assert client.get("/v1/admin/analytics/features/nope/population", headers=headers).status_code == 404


# ── users list + detail ─────────────────────────────────────────────────────

def test_users_list_pagination_search_and_flags(client):
    headers = _admin_headers()
    ids = _seed()

    r = client.get("/v1/admin/analytics/users?page_size=2", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    assert body["page_size"] == 2
    assert len(body["items"]) == 2

    r2 = client.get("/v1/admin/analytics/users?search=ana", headers=headers)
    items = r2.json()["items"]
    assert len(items) == 1
    row = items[0]
    assert row["pets"] == 2
    assert row["has_feeding"] is True
    assert row["active_control_pets"] == 1
    assert row["activity_status"] == "active"


def test_user_detail_has_pets_and_activity(client):
    headers = _admin_headers()
    ids = _seed()
    r = client.get(f"/v1/admin/analytics/users/{ids['tutor_a']}", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["email"] == "a@example.com"
    assert "password_hash" not in json.dumps(body)
    assert len(body["pets"]) == 2
    assert body["activity"]["events_total"] == 5
    assert body["pets"][0]["feature_states"]["food"] in ("active", "never_configured")

    assert client.get("/v1/admin/analytics/users/nope", headers=headers).status_code == 404


def test_pet_detail(client):
    headers = _admin_headers()
    ids = _seed()
    r = client.get(f"/v1/admin/analytics/pets/{ids['pet_full']}", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pet"]["name"] == "Rex"
    assert body["counts"]["vaccines"] == 1
    assert body["counts"]["parasite_controls"] == 1
    assert body["feature_states"]["vaccine"] == "active"
    assert body["feeding"]["food_brand"] == "Golden"


# ── data quality ────────────────────────────────────────────────────────────

def test_data_quality_and_drilldown(client):
    headers = _admin_headers()
    ids = _seed()
    r = client.get("/v1/admin/analytics/data-quality", headers=headers)
    assert r.status_code == 200, r.text
    issues = {i["key"]: i for i in r.json()["issues"]}
    assert issues["pets_without_birth"]["count"] == 1   # Mimi
    assert issues["pets_without_weight"]["count"] == 1
    assert issues["users_without_pet"]["count"] == 2
    assert issues["events_unknown_version"]["count"] >= 1

    d = client.get("/v1/admin/analytics/data-quality/pets_without_birth/population", headers=headers)
    assert d.status_code == 200
    assert d.json()["items"][0]["pet_id"] == ids["pet_bare"]


# ── retention + commerce ────────────────────────────────────────────────────

def test_retention_reports_insufficient_when_small(client):
    headers = _admin_headers()
    _seed()
    r = client.get("/v1/admin/analytics/retention", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "insufficient_data"


def test_commerce_never_calls_click_a_sale(client):
    headers = _admin_headers()
    _seed()
    r = client.get("/v1/admin/analytics/commerce", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["commerce_click"] == 1
    assert body["offer_viewed"] == 1
    assert body["ctr_by_exposure"] == 1.0
    assert "não são vendas" in body["sales_note"].lower()
    assert body["by_merchant"][0]["merchant"] == "cobasi"


def test_activation_funnel_is_unique_users(client):
    headers = _admin_headers()
    _seed()
    r = client.get("/v1/admin/analytics/activation-funnel", headers=headers)
    assert r.status_code == 200, r.text
    steps = {s["key"]: s for s in r.json()["steps"]}
    assert steps["account"]["users"] == 3
    assert steps["pet"]["users"] == 1
    assert steps["feeding"]["users"] == 1
    # no step exceeds 100%
    assert all(s["pct_of_total"] <= 1.0 for s in r.json()["steps"])


def test_geo_from_users_table_only(client):
    headers = _admin_headers()
    _seed()
    r = client.get("/v1/admin/analytics/geo", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["appstore_downloads"] is None
    assert any(s["state"] == "MG" for s in body["by_state"])
