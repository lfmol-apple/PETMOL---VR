"""Login social (Google/Apple) — endpoints /auth/google e /auth/apple.

Nenhum teste aqui bate na rede real do Google/Apple: `verify_google_id_token`
e `verify_apple_id_token` são mockados no módulo do router (é onde foram
importados), e os testes assumem só o contrato — claims dentro, usuário
achado/criado fora. A verificação real do JWT (JWKS, assinatura, aud, iss)
fica só em `src/user_auth/social_auth.py`, sem cobertura de rede aqui.
"""
import uuid

import pytest

from src.user_auth.social_auth import SocialClaims


def _cid() -> str:
    return f"cid-social-{uuid.uuid4().hex[:12]}"


def _headers(cid: str) -> dict:
    return {"X-PETMOL-CLIENT-ID": cid}


@pytest.fixture(autouse=True)
def _configure_social(monkeypatch):
    """Por padrão, os dois provedores ficam "configurados" (client_id
    presente) — o teste de 503 desliga explicitamente."""
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-google-client-id")
    monkeypatch.setenv("APPLE_SERVICES_ID", "test-apple-services-id")
    from src.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_google_login_creates_new_user(client, monkeypatch):
    monkeypatch.setattr(
        "src.user_auth.router.verify_google_id_token",
        lambda token: SocialClaims(sub="google-sub-1", email="novo.google@example.com", email_verified=True, name="Novo Tutor"),
    )
    resp = client.post("/auth/google", json={"id_token": "fake-id-token-value"}, headers=_headers(_cid()))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == "novo.google@example.com"
    assert body["email_verified"] is True
    assert body["access_token"]


def test_google_login_same_sub_returns_same_user(client, monkeypatch):
    monkeypatch.setattr(
        "src.user_auth.router.verify_google_id_token",
        lambda token: SocialClaims(sub="google-sub-2", email="repete.google@example.com", email_verified=True, name="Repete"),
    )
    cid = _cid()
    first = client.post("/auth/google", json={"id_token": "fake-id-token-value"}, headers=_headers(cid))
    second = client.post("/auth/google", json={"id_token": "fake-id-token-value"}, headers=_headers(cid))
    assert first.json()["id"] == second.json()["id"]


def test_google_login_links_existing_password_account_by_email(client, monkeypatch):
    signup = client.post(
        "/auth/signup",
        json={"name": "Já Tinha Conta", "email": "ja.tinha@example.com", "password": "senha123", "terms_accepted": True},
        headers=_headers(_cid()),
    )
    assert signup.status_code == 200, signup.text
    existing_id = signup.json()["id"]

    monkeypatch.setattr(
        "src.user_auth.router.verify_google_id_token",
        lambda token: SocialClaims(sub="google-sub-link", email="ja.tinha@example.com", email_verified=True, name="Já Tinha Conta"),
    )
    social = client.post("/auth/google", json={"id_token": "fake-id-token-value"}, headers=_headers(_cid()))
    assert social.status_code == 200, social.text
    assert social.json()["id"] == existing_id  # mesma conta, não duplicou


def test_apple_login_uses_name_from_payload_since_token_never_has_it(client, monkeypatch):
    monkeypatch.setattr(
        "src.user_auth.router.verify_apple_id_token",
        lambda token: SocialClaims(sub="apple-sub-1", email="novo.apple@example.com", email_verified=True, name=None),
    )
    resp = client.post(
        "/auth/apple",
        json={"id_token": "fake-id-token-value", "name": "Tutor da Apple"},
        headers=_headers(_cid()),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["email"] == "novo.apple@example.com"


def test_apple_login_subsequent_call_without_email_or_name_still_resolves(client, monkeypatch):
    monkeypatch.setattr(
        "src.user_auth.router.verify_apple_id_token",
        lambda token: SocialClaims(sub="apple-sub-2", email="primeira.vez@example.com", email_verified=True, name=None),
    )
    cid = _cid()
    first = client.post("/auth/apple", json={"id_token": "fake-id-token-value", "name": "Primeira Vez"}, headers=_headers(cid))
    user_id = first.json()["id"]

    # 2ª vez: Apple não manda email nem nome — só o sub, que já basta.
    monkeypatch.setattr(
        "src.user_auth.router.verify_apple_id_token",
        lambda token: SocialClaims(sub="apple-sub-2", email=None, email_verified=False, name=None),
    )
    second = client.post("/auth/apple", json={"id_token": "fake-id-token-value"}, headers=_headers(cid))
    assert second.status_code == 200, second.text
    assert second.json()["id"] == user_id


def test_google_login_rejects_invalid_token(client, monkeypatch):
    from fastapi import HTTPException

    def _raise(token):
        raise HTTPException(status_code=401, detail="Token do Google inválido.")

    monkeypatch.setattr("src.user_auth.router.verify_google_id_token", _raise)
    resp = client.post("/auth/google", json={"id_token": "garbage-id-token-value"}, headers=_headers(_cid()))
    assert resp.status_code == 401


def test_google_login_503_when_not_configured(client, monkeypatch):
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    from src.config import get_settings

    get_settings.cache_clear()
    resp = client.post("/auth/google", json={"id_token": "fake-id-token-value"}, headers=_headers(_cid()))
    assert resp.status_code == 503
