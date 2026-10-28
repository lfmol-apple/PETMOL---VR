"""Login social nativo: o servidor aceita o `aud` do site E o do app, e nada além disso.

Sem rede: a chave pública da Apple é simulada com um par RSA gerado aqui, e o
verificador do Google é simulado (a biblioteca dele já cobre assinatura/exp).
"""
import time
import uuid

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from jose import jwk as jose_jwk
from jose import jwt as jose_jwt

import src.user_auth.social_auth as sa
from src.user_auth.social_auth import SocialClaims


@pytest.fixture(autouse=True)
def _cfg(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "web-client.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_OAUTH_IOS_CLIENT_ID", "ios-client.apps.googleusercontent.com")
    monkeypatch.setenv("APPLE_SERVICES_ID", "br.com.petmol.web")
    monkeypatch.setenv("APPLE_BUNDLE_ID", "br.com.petmol.app")
    from src.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# ── Google ────────────────────────────────────────────────────────────────
def _google(monkeypatch, **claims):
    base = {"iss": "https://accounts.google.com", "sub": "g-1", "email": "a@example.com", "email_verified": True, "name": "A"}
    base.update(claims)
    monkeypatch.setattr("google.oauth2.id_token.verify_oauth2_token", lambda token, request, audience=None, **kw: base)


@pytest.mark.parametrize("aud", ["web-client.apps.googleusercontent.com", "ios-client.apps.googleusercontent.com"])
def test_google_accepts_web_and_ios_audience(monkeypatch, aud):
    _google(monkeypatch, aud=aud)
    assert sa.verify_google_id_token("tok")["sub"] == "g-1"


def test_google_rejects_foreign_audience(monkeypatch):
    _google(monkeypatch, aud="outro-app.apps.googleusercontent.com")
    with pytest.raises(HTTPException) as e:
        sa.verify_google_id_token("tok")
    assert e.value.status_code == 401


def test_google_rejects_wrong_issuer(monkeypatch):
    _google(monkeypatch, aud="web-client.apps.googleusercontent.com", iss="https://evil.example")
    with pytest.raises(HTTPException):
        sa.verify_google_id_token("tok")


def test_google_accepts_list_audience(monkeypatch):
    _google(monkeypatch, aud=["x", "ios-client.apps.googleusercontent.com"])
    assert sa.verify_google_id_token("tok")["email_verified"] is True


# ── Apple ─────────────────────────────────────────────────────────────────
@pytest.fixture()
def apple_key(monkeypatch):
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = priv.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    pub = jose_jwk.construct(priv.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo), "RS256").to_dict()
    pub.update({"kid": "k1", "use": "sig", "alg": "RS256"})
    monkeypatch.setattr(sa, "_fetch_apple_jwks", lambda force_refresh=False: [pub])
    return pem


def _apple_token(pem, aud, iss="https://appleid.apple.com", exp_delta=300):
    now = int(time.time())
    return jose_jwt.encode(
        {"iss": iss, "aud": aud, "sub": "ap-1", "email": "p@privaterelay.appleid.com", "email_verified": "true", "iat": now, "exp": now + exp_delta},
        pem, algorithm="RS256", headers={"kid": "k1"},
    )


@pytest.mark.parametrize("aud", ["br.com.petmol.web", "br.com.petmol.app"])
def test_apple_accepts_services_id_and_bundle_id(apple_key, aud):
    claims = sa.verify_apple_id_token(_apple_token(apple_key, aud))
    assert claims["sub"] == "ap-1" and claims["email_verified"] is True


def test_apple_rejects_foreign_audience(apple_key):
    with pytest.raises(HTTPException) as e:
        sa.verify_apple_id_token(_apple_token(apple_key, "com.outro.app"))
    assert e.value.status_code == 401


def test_apple_rejects_wrong_issuer_and_expired(apple_key):
    with pytest.raises(HTTPException):
        sa.verify_apple_id_token(_apple_token(apple_key, "br.com.petmol.app", iss="https://evil.example"))
    with pytest.raises(HTTPException):
        sa.verify_apple_id_token(_apple_token(apple_key, "br.com.petmol.app", exp_delta=-60))


# ── Ligação por e-mail só com e-mail verificado ──────────────────────────
def test_unverified_provider_email_cannot_take_over_existing_account(client, monkeypatch):
    cid = f"cid-aud-{uuid.uuid4().hex[:8]}"
    h = {"X-PETMOL-CLIENT-ID": cid}
    client.post("/auth/signup", json={"name": "Dono", "email": "vitima@example.com", "password": "senha123", "terms_accepted": True}, headers=h)
    monkeypatch.setattr(
        "src.user_auth.router.verify_google_id_token",
        lambda token: SocialClaims(sub="atacante-sub", email="vitima@example.com", email_verified=False, name="X"),
    )
    r = client.post("/auth/google", json={"id_token": "fake-id-token-value"}, headers=h)
    assert r.status_code == 409, r.text
