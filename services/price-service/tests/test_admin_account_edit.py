"""Dashboard 2 — conta completa do tutor: ver e corrigir a pedido do usuário."""
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


def _tutor(**kw):
    db = SessionLocal()
    try:
        u = User(email=f"t-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"),
                 name="Tutora", phone="11999990000", city="Osasco", state="SP", created_at=NOW, **kw)
        db.add(u)
        db.commit()
        return u.id, u.email
    finally:
        db.close()


def test_account_get_returns_full_editable_record(client):
    headers = _admin_headers()
    uid, email = _tutor()
    r = client.get(f"/v1/admin/accounts/{uid}", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == email
    assert body["phone"] == "11999990000"
    assert body["login_methods"] == ["senha"]


def test_account_patch_changes_only_given_fields(client):
    headers = _admin_headers()
    uid, _ = _tutor()
    r = client.patch(f"/v1/admin/accounts/{uid}", json={"name": "Nome Corrigido", "city": "Barueri"}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Nome Corrigido"
    assert body["city"] == "Barueri"
    assert body["state"] == "SP"            # não tocado
    assert body["phone"] == "11999990000"   # não tocado


def test_account_patch_rejects_duplicate_email_and_empty_name(client):
    headers = _admin_headers()
    uid, _ = _tutor()
    _, other_email = _tutor()
    dup = client.patch(f"/v1/admin/accounts/{uid}", json={"email": other_email}, headers=headers)
    assert dup.status_code == 409
    empty = client.patch(f"/v1/admin/accounts/{uid}", json={"name": "   "}, headers=headers)
    assert empty.status_code == 422


def test_account_patch_requires_admin(client):
    uid, _ = _tutor()
    assert client.patch(f"/v1/admin/accounts/{uid}", json={"name": "X"}).status_code in (401, 403)


def test_users_list_exposes_account_data_and_first_campaign(client):
    headers = _admin_headers()
    uid, _ = _tutor()
    db = SessionLocal()
    try:
        db.add(AnalyticsProductEvent(event_id=f"o-{uuid4().hex[:6]}", event_name="app_open", user_id=uid,
                                      utm_campaign="instagram_out", utm_source="instagram",
                                      received_at=NOW - timedelta(hours=1)))
        db.commit()
    finally:
        db.close()
    r = client.get("/v1/admin/analytics/users?search=Tutora", headers=headers)
    assert r.status_code == 200, r.text
    row = next(i for i in r.json()["items"] if i["user_id"] == uid)
    assert row["phone"] == "11999990000"
    assert row["login_methods"] == ["senha"]
    assert row["origin_campaign"] == "instagram_out"
    assert row["first_seen"]
