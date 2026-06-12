"""
Handoff de parceiros — loja/doglife.

GET /api/handoff/shop    — redireciona para loja parceira (petz/cobasi)
GET /api/handoff/doglife — redireciona para plano PetLove Dog Life

Comportamento:
- Valida/gera lead_id  
- Registra evento de analytics  
- Redireciona 302 para URL de afiliado  
- Se URL não configurada → retorna 503 JSON controlado (não 500)
"""
import secrets
import json
from typing import Optional, Union

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session

from .db import get_db
from .config import get_settings
from .analytics.models import AnalyticsEvent

router = APIRouter(prefix="/handoff", tags=["Handoff Partner"])


# ── Helpers ───────────────────────────────────────────────────────────────

def _ensure_lead(lead_id: Optional[str], db: Session, source: str, cta_type: str, target: str) -> str:
    """Retorna lead_id existente ou cria novo evento se lead_id inválido/ausente."""
    if not lead_id or len(lead_id) < 8:
        lead_id = secrets.token_hex(16)

    try:
        event = AnalyticsEvent(
            lead_id=lead_id,
            source=source,
            cta_type=cta_type,
            target=target,
        )
        db.add(event)
        db.commit()
    except Exception:
        db.rollback()

    return lead_id


def _no_url_response(partner: str) -> JSONResponse:
    """Resposta 503 controlada quando URL de afiliado não está configurada."""
    return JSONResponse(
        status_code=503,
        content={
            "error": "partner_url_not_configured",
            "partner": partner,
            "message": "URL de parceiro não configurada. Configure a variável de ambiente correspondente.",
        },
    )


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/shop", response_model=None)
def handoff_shop(
    partner: str = Query(default="petz", description="petz | cobasi | petlove | amazon"),
    lead_id: Optional[str] = Query(default=None),
    dest: Optional[str] = Query(default=None, description="URL destino override (ignorado em prod se affiliate URL configurada)"),
    q: Optional[str] = Query(default=None, description="Query de busca contextual (ex: marca de ração)"),
    db: Session = Depends(get_db),
) -> Union[RedirectResponse, JSONResponse]:
    """Redireciona para loja parceira com tracking de lead.

    - partner=petz    → PETZ_AFFILIATE_URL
    - partner=cobasi  → COBASI_AFFILIATE_URL
    - partner=petlove → PETLOVE_DOG_LIFE_URL
    - q=brand         → appends ?q=brand to affiliate URL for contextual search
    - Se URL não configurada → 503 JSON (não 500)
    """
    from urllib.parse import quote as _quote
    settings = get_settings()

    partner = partner.lower().strip()
    if partner == "cobasi":
        affiliate_url = settings.cobasi_affiliate_url or dest
        target = "cobasi"
    elif partner == "petlove":
        affiliate_url = settings.petlove_dog_life_url or dest
        target = "petlove"
    elif partner == "amazon":
        affiliate_url = getattr(settings, "amazon_affiliate_url", None) or dest or "https://www.amazon.com.br/s?k=pet+shop"
        target = "amazon"
    else:
        # default: petz
        affiliate_url = settings.petz_affiliate_url or dest
        target = "petz"

    lead_id = _ensure_lead(lead_id, db, source="handoff_shop", cta_type="shop_redirect", target=target)

    if not affiliate_url:
        return _no_url_response(partner)

    # Append contextual search query when provided
    if q and q.strip():
        sep = "&" if "?" in affiliate_url else "?"
        affiliate_url = f"{affiliate_url}{sep}q={_quote(q.strip())}"

    return RedirectResponse(url=affiliate_url, status_code=302)


@router.get("/doglife", response_model=None)
def handoff_doglife(
    lead_id: Optional[str] = Query(default=None),
    dest: Optional[str] = Query(default=None, description="URL destino override"),
    db: Session = Depends(get_db),
) -> Union[RedirectResponse, JSONResponse]:
    """Redireciona para plano PetLove Dog Life com tracking de lead.

    - Lê PETLOVE_DOG_LIFE_URL do ambiente.
    - Se URL não configurada → 503 JSON (não 500)
    """
    settings = get_settings()

    affiliate_url = settings.petlove_dog_life_url or dest
    lead_id = _ensure_lead(lead_id, db, source="handoff_doglife", cta_type="doglife_redirect", target="petlove")

    if not affiliate_url:
        return _no_url_response("petlove_doglife")

    return RedirectResponse(url=affiliate_url, status_code=302)
