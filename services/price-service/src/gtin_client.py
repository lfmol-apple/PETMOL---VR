"""RSC GTIN API client.

Credentials are read only from environment/settings. Never hardcode them here.
"""

from __future__ import annotations

import base64
import logging
import time
from typing import Any, Optional

import httpx

from .config import get_settings


logger = logging.getLogger(__name__)

GTIN_TOKEN_SAFETY_SECONDS = 60
GTIN_TIMEOUT_SECONDS = 4.0
VALID_GTIN_LENGTHS = {8, 12, 13, 14}

_token_cache: dict[str, Any] = {
    "token": None,
    "expires_at": 0.0,
}


class GtinConfigError(Exception):
    """Raised when RSC GTIN credentials are not configured."""


class GtinAuthError(Exception):
    """Raised when RSC GTIN authentication fails."""


class GtinExternalError(Exception):
    """Raised when RSC GTIN returns an unexpected upstream error."""


def normalize_gtin(value: str) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


def is_valid_gtin(value: str) -> bool:
    return len(normalize_gtin(value)) in VALID_GTIN_LENGTHS


def _base_url() -> str:
    settings = get_settings()
    return (settings.gtin_api_base_url or "https://gtin.rscsistemas.com.br").rstrip("/")


def _credentials() -> tuple[str, str]:
    settings = get_settings()
    username = (settings.gtin_api_username or "").strip()
    password = settings.gtin_api_password or ""
    if not username or not password:
        raise GtinConfigError("Integração GTIN não configurada")
    return username, password


def _basic_auth_header(username: str, password: str) -> str:
    raw = f"{username}:{password}".encode("utf-8")
    return f"Basic {base64.b64encode(raw).decode('ascii')}"


async def get_gtin_token(force_refresh: bool = False) -> str:
    cached_token = _token_cache.get("token")
    expires_at = float(_token_cache.get("expires_at") or 0)
    if cached_token and not force_refresh and time.time() < expires_at:
        return str(cached_token)

    username, password = _credentials()
    url = f"{_base_url()}/oauth/token"
    logger.info("[gtin-rsc] token request url=%s username_configured=%s", url, bool(username))

    try:
        async with httpx.AsyncClient(timeout=GTIN_TIMEOUT_SECONDS) as client:
            res = await client.post(
                url,
                headers={
                    "Authorization": _basic_auth_header(username, password),
                    "Accept": "application/json",
                },
            )
    except Exception as exc:
        logger.info("[gtin-rsc] token request failed error=%s", exc)
        raise GtinExternalError("Falha ao autenticar na API GTIN") from exc

    logger.info("[gtin-rsc] token response status=%s", res.status_code)
    if res.status_code == 401:
        raise GtinAuthError("Credenciais GTIN inválidas")
    if res.status_code < 200 or res.status_code >= 300:
        raise GtinExternalError(f"Erro ao autenticar na API GTIN: HTTP {res.status_code}")

    try:
        data = res.json()
    except Exception as exc:
        raise GtinExternalError("Resposta inválida ao autenticar na API GTIN") from exc

    token = data.get("token") if isinstance(data, dict) else None
    if not isinstance(token, str) or not token.strip():
        raise GtinExternalError("Token GTIN ausente na resposta")

    _token_cache["token"] = token.strip()
    _token_cache["expires_at"] = time.time() + 3600 - GTIN_TOKEN_SAFETY_SECONDS
    return token.strip()


async def _authorized_get(path: str, *, retry_on_401: bool = True) -> httpx.Response:
    token = await get_gtin_token()
    url = f"{_base_url()}{path}"
    logger.info("[gtin-rsc] request url=%s", url)

    async with httpx.AsyncClient(timeout=GTIN_TIMEOUT_SECONDS) as client:
        res = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
        )

    logger.info("[gtin-rsc] response path=%s status=%s", path, res.status_code)
    if res.status_code == 401 and retry_on_401:
        logger.info("[gtin-rsc] bearer token rejected; refreshing once")
        token = await get_gtin_token(force_refresh=True)
        async with httpx.AsyncClient(timeout=GTIN_TIMEOUT_SECONDS) as client:
            res = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
            )
        logger.info("[gtin-rsc] retry response path=%s status=%s", path, res.status_code)

    return res


async def get_product_by_gtin(gtin: str) -> Optional[dict[str, Any]]:
    normalized = normalize_gtin(gtin)
    if not is_valid_gtin(normalized):
        raise ValueError("GTIN inválido")

    res = await _authorized_get(f"/api/gtin/infor/{normalized}")
    if res.status_code == 404:
        return None
    if res.status_code == 401:
        raise GtinAuthError("Credenciais GTIN inválidas")
    if res.status_code < 200 or res.status_code >= 300:
        raise GtinExternalError(f"Erro ao consultar API GTIN: HTTP {res.status_code}")

    try:
        data = res.json()
    except Exception as exc:
        raise GtinExternalError("Resposta inválida da API GTIN") from exc

    if not isinstance(data, dict) or not data:
        return None
    return data


async def get_product_image_url(gtin: str) -> Optional[str]:
    normalized = normalize_gtin(gtin)
    if not is_valid_gtin(normalized):
        raise ValueError("GTIN inválido")

    res = await _authorized_get(f"/api/gtin/img/{normalized}")
    if res.status_code in {204, 404}:
        return None
    if res.status_code == 401:
        raise GtinAuthError("Credenciais GTIN inválidas")
    if res.status_code < 200 or res.status_code >= 300:
        logger.info("[gtin-rsc] image unavailable gtin=%s status=%s", normalized, res.status_code)
        return None

    return f"/api/products/lookup/gtin/{normalized}/image"


async def get_product_image_response(gtin: str) -> tuple[bytes, str] | None:
    normalized = normalize_gtin(gtin)
    if not is_valid_gtin(normalized):
        raise ValueError("GTIN inválido")

    res = await _authorized_get(f"/api/gtin/img/{normalized}")
    if res.status_code in {204, 404}:
        return None
    if res.status_code == 401:
        raise GtinAuthError("Credenciais GTIN inválidas")
    if res.status_code < 200 or res.status_code >= 300:
        raise GtinExternalError(f"Erro ao consultar imagem GTIN: HTTP {res.status_code}")

    content_type = res.headers.get("content-type") or "image/jpeg"
    return res.content, content_type


def first_text(payload: dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
    return None

