"""Verificação de id_token de login social (Google / Apple) — só web.

Nenhum dos dois fluxos usa segredo nosso: o SDK do Google/Apple no
navegador devolve um id_token (JWT) já assinado por ELES; aqui só
verificamos a assinatura com a chave pública deles (JWKS) e conferimos
que o `aud` bate com o client_id configurado em `config.py`. Não há
troca de código de autorização nem client_secret — por isso nenhuma
chave privada da Apple precisa ser guardada pra isto (diferente da
APNs, que é outro uso de chave Apple completamente separado).
"""
from __future__ import annotations

import logging
import time
from typing import Optional, TypedDict

import requests
from fastapi import HTTPException, status
from jose import jwt as jose_jwt
from jose.exceptions import JWTError

from ..config import get_settings

logger = logging.getLogger(__name__)

_APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
_APPLE_JWKS_TTL_SECONDS = 24 * 3600
_apple_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}


class SocialClaims(TypedDict):
    sub: str
    email: Optional[str]
    email_verified: bool
    name: Optional[str]


def _allowed_audiences(*values: Optional[str]) -> list[str]:
    return [v for v in values if v]


def _aud_matches(claim_aud, allowed: list[str]) -> bool:
    """`aud` pode vir como string ou lista; basta UM dos nossos identificadores."""
    auds = claim_aud if isinstance(claim_aud, (list, tuple)) else [claim_aud]
    return any(a in allowed for a in auds)


def verify_google_id_token(id_token_str: str) -> SocialClaims:
    settings = get_settings()
    # Site (client_id web) e app nativo iOS (client_id iOS). O app Android usa o
    # client_id web como serverClientId, então cai no primeiro.
    allowed = _allowed_audiences(settings.google_oauth_client_id, settings.google_oauth_ios_client_id)
    if not allowed:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Login com Google não está configurado.")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        # Assinatura/expiração/emissor verificados pela biblioteca; o `aud` é
        # conferido aqui contra a LISTA de client_ids aceitos.
        claims = google_id_token.verify_oauth2_token(id_token_str, google_requests.Request())
    except Exception as exc:  # biblioteca do Google levanta vários tipos distintos
        logger.warning("Google id_token inválido: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token do Google inválido.") from exc

    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com") or not _aud_matches(claims.get("aud"), allowed):
        logger.warning("Google id_token com iss/aud inesperado (aud=%s)", claims.get("aud"))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token do Google inválido.")

    return SocialClaims(
        sub=claims["sub"],
        email=claims.get("email"),
        email_verified=bool(claims.get("email_verified")),
        name=claims.get("name"),
    )


def _fetch_apple_jwks(force_refresh: bool = False) -> list:
    now = time.time()
    if not force_refresh and _apple_jwks_cache["keys"] and now - _apple_jwks_cache["fetched_at"] < _APPLE_JWKS_TTL_SECONDS:
        return _apple_jwks_cache["keys"]
    resp = requests.get(_APPLE_JWKS_URL, timeout=10)
    resp.raise_for_status()
    keys = resp.json().get("keys", [])
    _apple_jwks_cache["keys"] = keys
    _apple_jwks_cache["fetched_at"] = now
    return keys


def verify_apple_id_token(id_token_str: str) -> SocialClaims:
    settings = get_settings()
    # Site: Services ID. App nativo: bundle id.
    allowed = _allowed_audiences(settings.apple_services_id, settings.apple_bundle_id)
    if not allowed:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Login com Apple não está configurado.")
    try:
        header = jose_jwt.get_unverified_header(id_token_str)
        kid = header.get("kid")
        keys = _fetch_apple_jwks()
        key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            # A Apple rotaciona as chaves de vez em quando — tenta 1x sem
            # cache antes de considerar o token inválido.
            keys = _fetch_apple_jwks(force_refresh=True)
            key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            raise JWTError("kid não encontrado nas chaves públicas da Apple")
        claims = jose_jwt.decode(
            id_token_str, key, algorithms=["RS256"],
            issuer="https://appleid.apple.com", options={"verify_aud": False},
        )
        if not _aud_matches(claims.get("aud"), allowed):
            raise JWTError(f"aud inesperado: {claims.get('aud')}")
    except (JWTError, requests.RequestException) as exc:
        logger.warning("Apple id_token inválido: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token da Apple inválido.") from exc

    # A Apple historicamente manda email_verified como string "true"/"false"
    # dentro do id_token (não bool) — cobre os dois formatos.
    email_verified_raw = claims.get("email_verified")
    email_verified = (
        email_verified_raw is True
        or (isinstance(email_verified_raw, str) and email_verified_raw.lower() == "true")
    )

    return SocialClaims(
        sub=claims["sub"],
        email=claims.get("email"),
        email_verified=email_verified,
        # A Apple nunca manda nome no id_token — só no 1º login, num campo
        # `user.name` separado do SDK (ver SocialLoginRequest.name).
        name=None,
    )
