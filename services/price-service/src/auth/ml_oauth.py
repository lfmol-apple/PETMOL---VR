"""Mercado Livre OAuth routes.

PETMOL uses Mercado Livre Client Credentials for backend-only catalog access.
There is no user OAuth callback, PKCE flow, refresh token, or frontend token
exchange in the current integration.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, status

from ..config import get_settings
from ..db import get_db
from ..providers.mercadolivre import mercadolivre_provider

router = APIRouter(prefix="/auth/ml", tags=["OAuth"])
debug_router = APIRouter(prefix="/debug", tags=["Debug"])


def require_admin_or_readonly_key(
    db=Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    cookie_token: Optional[str] = Cookie(default=None, alias="petmol_session"),
    x_admin_api_key: Optional[str] = Header(default=None, alias="X-Admin-Api-Key"),
):
    # Lazy import: importing admin.deps at module load executes
    # admin/__init__.py, which pulls unrelated routers before the app is
    # fully initialized in Python 3.9 test runs.
    from ..admin.deps import get_current_admin_or_readonly_key

    return get_current_admin_or_readonly_key(
        db=db,
        authorization=authorization,
        cookie_token=cookie_token,
        x_admin_api_key=x_admin_api_key,
    )


@router.get("/start")
async def start_oauth_disabled():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Fluxo OAuth de usuário do Mercado Livre desativado; PETMOL usa Client Credentials no backend.",
    )


@router.get("/callback")
async def oauth_callback_disabled():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Callback OAuth de usuário do Mercado Livre desativado; não há Authorization Code/PKCE neste fluxo.",
    )


@debug_router.get("/ml/status")
async def ml_status(current=Depends(require_admin_or_readonly_key)):
    """Admin/read-only status without secrets or token values."""
    settings = get_settings()
    token_status = mercadolivre_provider._token_client.get_status()
    return {
        "enabled": bool(settings.enable_ml_provider),
        "public_offers_enabled": bool(settings.mercadolivre_public_offers_enabled),
        "affiliate_links_configured": bool(settings.mercadolivre_affiliate_enabled),
        "client_id_configured": token_status.client_id_configured,
        "client_secret_configured": token_status.client_secret_configured,
        "has_access_cached": token_status.has_access_cached,
        "access_expires_at": token_status.access_expires_at,
        "grant_type": token_status.grant_type,
        "site": "MLB",
    }
