"""Dashboard 2 — funil de crescimento (acessos → downloads → cadastros → pet → alimentação)."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from src.admin.models import AdminUser
from src.analytics.install_models import AppInstall
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
        u = User(email="leonardofmol@gmail.com", password_hash=hash_password("x"), name="Admin",
                 created_at=NOW - timedelta(days=60))
        db.add(u)
        db.commit()
        db.add(AdminUser(user_id=u.id, role="master"))
        db.commit()
        return {"Authorization": f"Bearer {create_access_token(u.id)}"}
    finally:
        db.close()


def _seed():
    """4 acessos (3 iOS, 1 web), 2 downloads iOS, 3 cadastros em 2 dias:
    A só conta; B conta+pet; C conta+pet+alimentação."""
    db = SessionLocal()
    try:
        users = {}
        for key in "abc":
            users[key] = User(email=f"{key}-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"),
                              name=key, created_at=NOW - timedelta(days=2))
        db.add_all(users.values())
        db.commit()
        pet_b = Pet(user_id=users["b"].id, name="Rex", species="dog", breed="SRD")
        pet_c = Pet(user_id=users["c"].id, name="Mia", species="cat", breed="SRD")
        db.add_all([pet_b, pet_c])
        db.commit()
        db.add(FeedingPlan(pet_id=pet_c.id, species="cat", country_code="BR", food_brand="Whiskas",
                            items_json='[{"gtin":"456"}]', daily_amount_g=80, duration_days=20, enabled=True))
        for i, plat in enumerate(["ios_capacitor", "ios_capacitor", "ios_capacitor", "web"]):
            db.add(AnalyticsProductEvent(event_id=f"g-{i}-{uuid4().hex[:6]}", event_name="app_open",
                                          platform=plat, anonymous_id=f"anon-{i}",
                                          received_at=NOW - timedelta(hours=i + 1)))
        for _ in range(2):
            db.add(AppInstall(platform="ios", city="São Paulo", created_at=NOW - timedelta(hours=3)))
        db.commit()
    finally:
        db.close()


def test_growth_funnel_counts_and_finds_the_biggest_leak(client):
    headers = _admin_headers()
    _seed()

    r = client.get("/v1/admin/analytics/growth?period_days=7", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    n = {s["key"]: s["n"] for s in body["steps"]}

    assert n["acessos"] == 4
    assert n["downloads"] == 2
    assert n["cadastros"] == 3
    assert n["pet"] == 2
    assert n["feeding"] == 1
    # cadastros / downloads = 150% não é vazamento; o pior é pet→alimentação (50%)
    # e cadastros→pet (66%) — o menor % ganha
    assert body["biggest_leak"]["to"] == "feeding"
    assert body["stuck"] == {"cadastro_sem_pet": 1, "pet_sem_alimentacao": 1}
    assert body["biggest_leak"]["where_to_act"]


def test_growth_funnel_platform_filter_limits_acessos_and_downloads(client):
    headers = _admin_headers()
    _seed()

    r = client.get("/v1/admin/analytics/growth?period_days=7&platform=web", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    n = {s["key"]: s["n"] for s in body["steps"]}
    assert n["acessos"] == 1
    assert n["downloads"] == 0
    assert body["filters_applied"]["platform"] is True


def test_growth_funnel_city_filter_flags_that_acessos_are_not_filtered(client):
    headers = _admin_headers()
    _seed()

    r = client.get("/v1/admin/analytics/growth?period_days=7&city=São Paulo", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["filters_applied"]["city"]["acessos"] is False
    assert body["filters_applied"]["city"]["downloads"] is True
    assert any("localização" in note for note in body["notes"])


def test_growth_activation_goal_pet_feeding_push_gps(client):
    headers = _admin_headers()
    _seed()  # A só conta; B pet; C pet + ração

    db = SessionLocal()
    try:
        c = db.query(User).filter(User.name == "c").first()
        c.location_source = "gps"
        c.lat, c.lng = -23.5, -46.6
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/growth?period_days=7", headers=headers)
    assert r.status_code == 200, r.text
    act = r.json()["activation"]
    items = {i["key"]: i for i in act["items"]}

    assert act["total"] == 3
    assert items["pet"]["n"] == 2
    assert items["feeding"]["n"] == 1
    assert items["push"]["n"] == 0
    assert items["location"]["n"] == 1       # só C compartilha GPS
    assert act["complete"] == 0               # ninguém tem notificação ainda
    assert act["weakest"] == "push"
    assert items["push"]["only_missing"] == 1  # C só não tem notificação
    assert items["push"]["where_to_act"]


def test_users_list_filters_by_activation_goal(client):
    headers = _admin_headers()
    _seed()
    r = client.get("/v1/admin/analytics/users?activated=yes", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 0
    r = client.get("/v1/admin/analytics/users?missing=pet", headers=headers)
    names = {i["name"] for i in r.json()["items"]}
    assert "a" in names and "b" not in names and "c" not in names


def test_growth_activation_by_campaign_of_origin(client):
    headers = _admin_headers()
    _seed()
    db = SessionLocal()
    try:
        c = db.query(User).filter(User.name == "c").first()
        db.add(AnalyticsProductEvent(event_id=f"cm-{uuid4().hex[:6]}", event_name="app_open", user_id=c.id,
                                      anonymous_id="anon-c", utm_campaign="instagram_out", utm_source="instagram",
                                      platform="ios_capacitor", received_at=NOW - timedelta(hours=5)))
        db.commit()
    finally:
        db.close()
    r = client.get("/v1/admin/analytics/growth?period_days=7", headers=headers)
    assert r.status_code == 200, r.text
    rows = {c["name"]: c for c in r.json()["campaigns_activation"]}
    assert rows["instagram_out"]["cadastros"] == 1
    assert rows["instagram_out"]["pet"] == 1 and rows["instagram_out"]["feeding"] == 1
    assert sum(c["cadastros"] for c in rows.values()) == 3


def test_growth_cost_per_activated_tutor_and_spend_without_return(client):
    from src.analytics.spend_models import CampaignSpend
    headers = _admin_headers()
    _seed()
    db = SessionLocal()
    try:
        c = db.query(User).filter(User.name == "c").first()
        c.location_source = "gps"
        c.lat, c.lng = -23.5, -46.6
        db.add(AnalyticsProductEvent(event_id=f"cp-{uuid4().hex[:6]}", event_name="app_open", user_id=c.id,
                                      anonymous_id="anon-c2", utm_campaign="instagram_out", utm_source="instagram",
                                      platform="ios_capacitor", received_at=NOW - timedelta(hours=5)))
        today = (NOW - timedelta(hours=1)).date()
        db.add(CampaignSpend(utm_campaign="instagram_out", spent_on=today, amount_cents=10000))
        db.add(CampaignSpend(utm_campaign="tiktok_sem_retorno", spent_on=today, amount_cents=5000))
        db.commit()
    finally:
        db.close()
    r = client.get("/v1/admin/analytics/growth?period_days=7", headers=headers)
    assert r.status_code == 200, r.text
    rows = {c["name"]: c for c in r.json()["campaigns_activation"]}
    assert rows["instagram_out"]["gasto_brl"] == 100.0
    assert rows["instagram_out"]["custo_por_cadastro"] == 100.0
    assert rows["instagram_out"]["custo_por_ativado"] is None   # ninguém completou a meta (falta notificação)
    assert rows["tiktok_sem_retorno"]["cadastros"] == 0
    assert rows["tiktok_sem_retorno"]["gasto_brl"] == 50.0
