import json
from datetime import datetime, timedelta, timezone

from src.admin.deps import get_current_admin_or_readonly_key
from src.admin.models import AdminUser
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
from src.main import app
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def _create_user(email: str = "leonardofmol@gmail.com") -> tuple[str, str]:
    db = SessionLocal()
    try:
        user = User(email=email, password_hash=hash_password("secret123"), name="Admin")
        db.add(user)
        db.commit()
        token = create_access_token(user.id)
        return user.id, token
    finally:
        db.close()


def _create_admin() -> tuple[str, dict[str, str]]:
    user_id, token = _create_user()
    db = SessionLocal()
    try:
        db.add(AdminUser(user_id=user_id, role="master"))
        db.commit()
    finally:
        db.close()
    return user_id, {"Authorization": f"Bearer {token}"}


def _add_event(event_name: str, *, user_id: str | None = None, anonymous_id: str = "anon-1", **props) -> None:
    db = SessionLocal()
    try:
        db.add(AnalyticsProductEvent(
            event_id=f"evt-{event_name}-{anonymous_id}-{len(props)}-{datetime.now(timezone.utc).timestamp()}",
            event_name=event_name,
            user_id=user_id,
            anonymous_id=anonymous_id,
            session_id="sess-1",
            screen=props.pop("screen", None),
            platform=props.pop("platform", "web"),
            app_version=props.pop("app_version", "test-sha"),
            properties_json=json.dumps(props) if props else None,
            occurred_at=datetime.now(timezone.utc),
            received_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        ))
        db.commit()
    finally:
        db.close()


def test_analytics_event_accepts_valid_event(client):
    response = client.post("/analytics/event", json={
        "event_name": "app_open",
        "anonymous_id": "anon-abc",
        "session_id": "sess-abc",
        "platform": "web",
    })
    assert response.status_code == 201
    assert response.json()["accepted"] is True


def test_authenticated_event_associates_user_id(client):
    user_id, token = _create_user("user@example.com")
    response = client.post(
        "/analytics/event",
        json={"event_name": "screen_view", "anonymous_id": "anon-auth", "session_id": "sess-auth"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    db = SessionLocal()
    try:
        row = db.query(AnalyticsProductEvent).filter(AnalyticsProductEvent.anonymous_id == "anon-auth").one()
        assert row.user_id == user_id
    finally:
        db.close()


def test_anonymous_event_accepts_ids_and_strips_pii(client):
    response = client.post("/analytics/event", json={
        "event_name": "offer_viewed",
        "anonymous_id": "anon-clean",
        "session_id": "sess-clean",
        "properties": {
            "merchant": "cobasi",
            "email": "x@example.com",
            "phone": "11999999999",
            "name": "Tutor",
            "gtin": "7891234567895",
        },
    })
    assert response.status_code == 201
    db = SessionLocal()
    try:
        row = db.query(AnalyticsProductEvent).filter(AnalyticsProductEvent.anonymous_id == "anon-clean").one()
        props = json.loads(row.properties_json)
        assert row.session_id == "sess-clean"
        assert props["merchant"] == "cobasi"
        assert props["gtin"] == "7891234567895"
        assert "email" not in props
        assert "phone" not in props
        assert "name" not in props
    finally:
        db.close()


def test_mission_control_requires_admin_auth(client):
    response = client.get("/v1/admin/mission-control")
    assert response.status_code == 401


def test_metrics_food_requires_admin_auth_and_accepts_valid_admin(client):
    response = client.get("/metrics/food")
    assert response.status_code == 401
    _user_id, headers = _create_admin()
    ok = client.get("/metrics/food", headers=headers)
    assert ok.status_code == 200


def test_mission_control_aggregates_growth_active_funnel_and_platforms(client):
    user_id, headers = _create_admin()
    db = SessionLocal()
    try:
        db.add(Pet(user_id=user_id, name="Pet", species="dog"))
        db.commit()
    finally:
        db.close()

    for event_name in ["signup_started", "register_completed", "pet_created", "pet_profile_completed", "store_opened", "offer_viewed"]:
        _add_event(event_name, user_id=user_id, anonymous_id="anon-funnel", merchant="cobasi", platform="web")
    _add_event("commerce_click", user_id=user_id, anonymous_id="anon-funnel", merchant="cobasi", link_type="affiliate_product")
    _add_event("unrelated_event", user_id=user_id, anonymous_id="anon-funnel")

    response = client.get("/v1/admin/mission-control", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["growth"]["total_users"] == 1
    assert body["growth"]["total_pets"] == 1
    assert body["growth"]["active_users_24h"] == 1
    assert body["commerce"]["offer_viewed"] == 1
    assert body["commerce"]["commerce_click"] == 1
    assert body["commerce"]["ctr"] == 1.0
    assert body["platforms"]["platforms"][0]["platform"] == "web"

    funnel = {step["event_name"]: step["count"] for step in body["funnel"]["steps"]}
    assert funnel["signup_started"] == 1
    assert "unrelated_event" not in funnel


def test_commerce_click_is_not_counted_as_sale(client):
    _user_id, headers = _create_admin()
    _add_event("offer_viewed", anonymous_id="anon-commerce", merchant="shopee")
    _add_event("commerce_click", anonymous_id="anon-commerce", merchant="shopee", link_type="affiliate_marketplace_offer")

    response = client.get("/v1/admin/mission-control", headers=headers)
    assert response.status_code == 200
    commerce = response.json()["commerce"]
    assert commerce["commerce_click"] == 1
    assert commerce["sales_confirmed"] is None
    assert "não venda confirmada" in commerce["sales_confirmed_note"]


def test_mission_control_admin_override_keeps_dashboard_endpoint_available_without_store_health(client):
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: None
    try:
        response = client.get("/v1/admin/mission-control")
    finally:
        app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)
    assert response.status_code == 200
    body = response.json()
    assert body["commerce"]["cobasi"]["availability"] == "not_instrumented"
    assert body["commerce"]["shopee"]["active_offers"] == 0
