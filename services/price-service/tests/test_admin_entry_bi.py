"""Dashboard 2 — funil de entrada (baixou e não cadastrou)."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from src.admin.models import AdminUser
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
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


def _ev(db, name, anon, platform="ios_capacitor", user_id=None, props=None):
    import json
    db.add(AnalyticsProductEvent(
        event_id=f"{name}-{uuid4().hex[:8]}", event_name=name, anonymous_id=anon, platform=platform,
        user_id=user_id, properties_json=json.dumps(props) if props else None,
        received_at=NOW - timedelta(hours=1),
    ))


def test_entry_funnel_counts_people_per_screen_and_failures(client):
    headers = _admin_headers()
    db = SessionLocal()
    try:
        # 4 aparelhos abriram o app sem conta; 3 abriram o cadastro; 2 passaram do nome; 1 concluiu
        for a in ("p1", "p2", "p3", "p4"):
            _ev(db, "app_open", a)
        for a in ("p1", "p2", "p3"):
            _ev(db, "signup_started", a)
        for a in ("p1", "p2"):
            _ev(db, "register_step1_completed", a)
        _ev(db, "register_completed", "p1")
        _ev(db, "auth_screen_shown", "p1", props={"variant": "choose"})
        _ev(db, "register_failed", "p2", props={"reason": "validation", "field": "password"})
        _ev(db, "register_failed", "p3", props={"reason": "server"})
        # quem já tem conta e só volta ao app não entra
        _ev(db, "app_open", "veterano", user_id="u-existente")
        # web fica fora quando não há filtro de plataforma
        _ev(db, "app_open", "web1", platform="web")
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/entry-funnel?period_days=7", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    n = {s["key"]: s["n"] for s in body["steps"]}
    assert n == {"opened": 4, "auth_screen": 1, "signup_started": 3, "step1": 2, "completed": 1}
    assert body["scope"] == "native"
    reasons = {f["reason"]: f["count"] for f in body["failures"]}
    assert reasons == {"validation:password": 1, "server": 1}
    # 3 abriram o cadastro e 2 passaram do nome (67%); 2 → 1 concluiu (50%) é a maior perda
    assert body["biggest_leak"]["to_label"] == "Concluíram o cadastro"
