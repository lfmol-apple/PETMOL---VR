"""get_current_admin and bootstrap_promote_admin must deny (403) — never
crash (500) — when ADMIN_MASTER_EMAIL isn't configured. Exercises the real
endpoints through TestClient, not dependency_overrides, so it actually
covers the `not settings.admin_master_email or ...` guard added to each.
No personal email anywhere in this file.
"""
import pytest

from src.config import get_settings


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup_and_login(client, cid: str, email: str) -> str:
    signup = client.post(
        "/auth/signup",
        json={"name": "Tutor Teste", "email": email, "password": "senha123", "terms_accepted": True},
        headers=_headers(cid),
    )
    assert signup.status_code == 200, signup.text

    login = client.post(
        "/auth/login",
        json={"email": email, "password": "senha123"},
        headers=_headers(cid),
    )
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


@pytest.fixture(autouse=True)
def _clear_admin_master_email(monkeypatch):
    # src/admin/router.py reads `settings = get_settings()` at MODULE level
    # (captured once at import time), not per-request — so env var + cache_clear()
    # wouldn't reach it. Patching the attribute on the actual cached singleton
    # affects every reference to it (router.py's stale module-level copy AND
    # deps.py's per-call get_settings()), since @lru_cache means they're the
    # same object as long as cache_clear() is never called here.
    monkeypatch.setattr(get_settings(), "admin_master_email", None)
    yield


def test_get_current_admin_denies_with_403_when_unset(client):
    token = _signup_and_login(client, "cid-admin-guard-me", "admin.guard.test@example.com")
    assert get_settings().admin_master_email is None

    resp = client.get("/v1/admin/me", headers=_headers("cid-admin-guard-me", token))

    assert resp.status_code == 403, resp.text


def test_bootstrap_promote_admin_denies_with_403_when_unset(client):
    assert get_settings().admin_master_email is None

    resp = client.post(
        "/v1/admin/bootstrap/promote",
        json={"email": "admin.guard.bootstrap@example.com", "role": "admin"},
    )

    assert resp.status_code == 403, resp.text
