"""
Mercado Livre OAuth 2.0 with PKCE (S256).

Endpoints:
- GET /auth/ml/start - Redirect to ML authorization page
- GET /auth/ml/callback - Handle callback, exchange code for tokens
- GET /debug/ml/status - Check connection status (admin only)
"""
import base64
import hashlib
import os
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse

from ..config import get_settings
from .token_store import get_token_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/ml", tags=["OAuth"])

# ML OAuth URLs (Brazil)
ML_AUTH_URL = "https://auth.mercadolivre.com.br/authorization"
ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token"

# Cookie names
COOKIE_STATE = "petmol_ml_state"
COOKIE_VERIFIER = "petmol_ml_verifier"
COOKIE_MAX_AGE = 600  # 10 minutes


def get_ml_redirect_uri() -> str:
    settings = get_settings()
    frontend_url = str(settings.frontend_url or "https://petmol.com.br").rstrip("/")
    return f"{frontend_url}/api/auth/ml/callback"


def generate_code_verifier() -> str:
    """Generate cryptographically random code_verifier (43-128 chars, URL-safe)."""
    random_bytes = os.urandom(32)
    return base64.urlsafe_b64encode(random_bytes).decode().rstrip("=")


def generate_code_challenge(verifier: str) -> str:
    """Generate code_challenge = base64url(sha256(verifier))."""
    sha256_hash = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(sha256_hash).decode().rstrip("=")


def generate_state() -> str:
    """Generate random state for CSRF protection."""
    return base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("=")


@router.get("/start")
async def start_oauth(request: Request):
    """
    Start OAuth flow - redirect to Mercado Livre authorization page.
    
    Sets httpOnly cookies for state and code_verifier.
    """
    settings = get_settings()
    
    if not settings.mercadolivre_client_id:
        raise HTTPException(status_code=500, detail="ML_CLIENT_ID not configured")
    
    # Generate PKCE values
    state = generate_state()
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)
    
    # Build authorization URL
    redirect_uri = get_ml_redirect_uri()
    
    auth_url = (
        f"{ML_AUTH_URL}?"
        f"response_type=code&"
        f"client_id={settings.mercadolivre_client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"code_challenge={code_challenge}&"
        f"code_challenge_method=S256&"
        f"state={state}"
    )
    
    # Create redirect response with cookies
    response = RedirectResponse(url=auth_url, status_code=302)
    
    # Set httpOnly, Secure, SameSite=Lax cookies
    response.set_cookie(
        key=COOKIE_STATE,
        value=state,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    response.set_cookie(
        key=COOKIE_VERIFIER,
        value=code_verifier,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    
    logger.info("[ML OAuth] Started authorization flow")
    return response


@router.get("/callback", response_class=HTMLResponse)
async def oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    """
    Handle OAuth callback from Mercado Livre.
    
    Exchanges authorization code for tokens using PKCE.
    Saves refresh_token persistently.
    """
    settings = get_settings()
    
    # Check for errors from ML
    if error:
        logger.error(f"[ML OAuth] Error: {error} - {error_description}")
        return HTMLResponse(
            content=f"""
            <html>
            <head><title>PETMOL - Erro</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>❌ Erro na autorização</h1>
                <p><strong>{error}</strong></p>
                <p>{error_description or "Tente novamente"}</p>
                <a href="/api/auth/ml/start">Tentar novamente</a>
            </body>
            </html>
            """,
            status_code=400,
        )
    
    # Validate required params
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state parameter")
    
    # Validate state from cookie
    cookie_state = request.cookies.get(COOKIE_STATE)
    if not cookie_state or cookie_state != state:
        logger.warning("[ML OAuth] State mismatch - possible CSRF attack")
        raise HTTPException(status_code=400, detail="Invalid state - possible CSRF attack")
    
    # Get code_verifier from cookie
    code_verifier = request.cookies.get(COOKIE_VERIFIER)
    if not code_verifier:
        raise HTTPException(status_code=400, detail="Missing code_verifier cookie")
    
    # Exchange code for tokens
    redirect_uri = get_ml_redirect_uri()
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                ML_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "client_id": settings.mercadolivre_client_id,
                    "client_secret": settings.mercadolivre_client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "code_verifier": code_verifier,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            
            if response.status_code != 200:
                error_data = response.json() if response.text else {}
                error_msg = error_data.get("message", response.text[:200])
                logger.error(f"[ML OAuth] Token exchange failed: {response.status_code} - {error_msg}")
                return HTMLResponse(
                    content=f"""
                    <html>
                    <head><title>PETMOL - Erro</title></head>
                    <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                        <h1>❌ Erro ao obter token</h1>
                        <p>Status: {response.status_code}</p>
                        <p>{error_msg}</p>
                        <a href="/api/auth/ml/start">Tentar novamente</a>
                    </body>
                    </html>
                    """,
                    status_code=400,
                )
            
            data = response.json()
            
    except httpx.TimeoutException:
        logger.error("[ML OAuth] Token exchange timeout")
        raise HTTPException(status_code=504, detail="Timeout connecting to Mercado Livre")
    except Exception as e:
        logger.error(f"[ML OAuth] Token exchange error: {e}")
        raise HTTPException(status_code=500, detail="Internal error during token exchange")
    
    # Save tokens
    token_store = get_token_store()
    
    refresh_token = data.get("refresh_token")
    access_token = data.get("access_token")
    expires_in = data.get("expires_in", 21600)  # 6 hours default
    
    if refresh_token:
        token_store.save_refresh_token(refresh_token)
    
    if access_token:
        token_store.set_access_token(access_token, expires_in)
    
    logger.info("[ML OAuth] Authorization successful - tokens saved")
    
    # Build success response
    html_response = HTMLResponse(
        content="""
        <html>
        <head>
            <title>PETMOL - Conectado</title>
            <style>
                body { font-family: sans-serif; text-align: center; padding: 50px; background: #f0f9f0; }
                .success { color: #2e7d32; }
                .box { background: white; padding: 30px; border-radius: 10px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            </style>
        </head>
        <body>
            <div class="box">
                <h1 class="success">✅ Mercado Livre Conectado!</h1>
                <p>O PETMOL agora pode buscar preços reais.</p>
                <p><a href="/api/debug/ml/status">Ver status</a></p>
                <p><a href="/">Voltar ao site</a></p>
            </div>
        </body>
        </html>
        """,
        status_code=200,
    )
    
    # Clear cookies
    html_response.delete_cookie(COOKIE_STATE)
    html_response.delete_cookie(COOKIE_VERIFIER)
    
    return html_response


# Debug endpoint (separate router for /debug prefix)
debug_router = APIRouter(prefix="/debug", tags=["Debug"])


@debug_router.get("/ml/status")
async def ml_status():
    """
    Check Mercado Livre connection status.
    
    Does NOT expose any tokens.
    """
    settings = get_settings()
    token_store = get_token_store()
    
    status = token_store.get_status()
    status["client_id_configured"] = bool(settings.mercadolivre_client_id)
    status["client_secret_configured"] = bool(settings.mercadolivre_client_secret)
    
    return status
