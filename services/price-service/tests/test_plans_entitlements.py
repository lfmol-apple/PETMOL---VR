"""Planos e direitos por conta (plans/): resolve_plan + GET /plans/me. Flag OFF = nada muda."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from src.config import get_settings
from src.db import SessionLocal
from src.plans import service as svc
from src.plans.models import Subscription
from src.user_auth.models import User

UA_OLD = "Mozilla/5.0 (iPhone) PetmolApp"
UA_NEW = "Mozilla/5.0 (iPhone) PetmolApp/2.0"
UA_WEB = "Mozilla/5.0 (Macintosh) Chrome/120"


def _h(cid, token=None):
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup(client, cid, email):
    client.post("/auth/signup", json={"name": "Tutor Teste", "email": email, "password": "senha123", "terms_accepted": True}, headers=_h(cid))
    r = client.post("/auth/login", json={"email": email, "password": "senha123"}, headers=_h(cid))
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def plans_on():
    s = get_settings()
    old = s.plans_enabled
    s.plans_enabled = True
    yield s
    s.plans_enabled = old


def _user_id(email):
    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).first().id
    finally:
        db.close()


def test_flag_off_everyone_unlimited_and_endpoint_404(client):
    tok = _signup(client, "cid-pl-off", "pl.off@example.com")
    assert client.get("/plans/me", headers=_h("cid-pl-off", tok)).status_code == 404
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == "pl.off@example.com").first()
        assert svc.resolve_plan(db, u, UA_NEW).plan == "unlimited"
    finally:
        db.close()


def test_legacy_shell_is_legacy_even_without_subscription(client, plans_on):
    tok = _signup(client, "cid-pl-old", "pl.old@example.com")
    r = client.get("/plans/me", headers={**_h("cid-pl-old", tok), "User-Agent": UA_OLD})
    assert r.status_code == 200
    assert r.json()["plan"] == "legacy" and r.json()["limits"] == {}


def test_new_shell_and_web_get_free_with_limits(client, plans_on):
    tok = _signup(client, "cid-pl-new", "pl.new@example.com")
    for ua in (UA_NEW, UA_WEB):
        r = client.get("/plans/me", headers={**_h("cid-pl-new", tok), "User-Agent": ua})
        body = r.json()
        assert body["plan"] == "free"
        assert body["limits"]["max_pets"] == plans_on.plans_free_max_pets
        assert body["usage"]["pets"] == 0


def test_active_subscription_is_premium_expired_is_free(client, plans_on):
    tok = _signup(client, "cid-pl-sub", "pl.sub@example.com")
    uid = _user_id("pl.sub@example.com")
    db = SessionLocal()
    try:
        sub = Subscription(user_id=uid, store="apple", product_id="petmol.monthly", store_subscription_id="orig-1",
                           status="active", current_period_end=datetime.now(timezone.utc) + timedelta(days=10))
        db.add(sub)
        db.commit()
        r = client.get("/plans/me", headers={**_h("cid-pl-sub", tok), "User-Agent": UA_NEW})
        assert r.json()["plan"] == "premium"
        assert all(v is None for v in r.json()["limits"].values())
        sub.current_period_end = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
        r = client.get("/plans/me", headers={**_h("cid-pl-sub", tok), "User-Agent": UA_NEW})
        assert r.json()["plan"] == "free"
        # status cancelado também não vale
        sub.current_period_end = datetime.now(timezone.utc) + timedelta(days=10)
        sub.status = "canceled"
        db.commit()
        assert client.get("/plans/me", headers={**_h("cid-pl-sub", tok), "User-Agent": UA_NEW}).json()["plan"] == "free"
    finally:
        db.close()


def test_legacy_shell_ignores_subscription_state(client, plans_on):
    """Versão atual não depende de assinatura: continua legacy mesmo se a conta assinou na versão nova."""
    tok = _signup(client, "cid-pl-leg2", "pl.leg2@example.com")
    uid = _user_id("pl.leg2@example.com")
    db = SessionLocal()
    try:
        db.add(Subscription(user_id=uid, store="google", product_id="petmol.yearly", store_subscription_id="tok-9", status="active"))
        db.commit()
    finally:
        db.close()
    r = client.get("/plans/me", headers={**_h("cid-pl-leg2", tok), "User-Agent": UA_OLD})
    assert r.json()["plan"] == "legacy"
