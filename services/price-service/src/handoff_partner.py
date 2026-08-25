"""
Handoff de parceiros — loja/doglife.

GET /api/handoff/shop    — redireciona para loja parceira configurada
GET /api/handoff/doglife — redireciona para plano PetLove Dog Life

Comportamento:
- Valida/gera lead_id
- Registra evento de analytics
- Redireciona 302 para URL de afiliado
- Se URL não configurada → retorna 503 JSON controlado (não 500)

Auditoria de monetização (25/08/2026, ver docs/AFFILIATES.md): este
router é anterior ao redesenho de CommerceEngine/AFFILIATE_ONLY_COMMERCE
e tinha dois problemas reais, corrigidos aqui:

1. `dest` (query param do cliente) era usado como destino literal do
   redirect 302 sempre que a env var do parceiro estava vazia — um
   open redirect: qualquer chamador podia mandar
   `?partner=cobasi&dest=https://evil.example` e o backend PETMOL
   redirecionava pra lá. Removido — `dest` nunca mais vira URL de
   redirect.
2. `partner=petz` lia `settings.petz_affiliate_url` direto, ignorando
   completamente `is_petz_publicly_servable()` (o gate único criado
   pra fechar exatamente essa classe de bug em
   /commerce/petz-direct-link). Corrigido: petz e cobasi agora passam
   por `get_monetized_offer(..., context="store")`, que já aplica
   os gates corretos (petz: is_petz_publicly_servable; cobasi:
   cobasi_affiliate_mode != "disabled"). `petlove` não tem gate
   equivalente na arquitetura ainda (não é um merchant auditado em
   nenhum outro lugar do código) — mantido como estava, só com
   validação de URL, pra não desligar algo que pode estar em uso
   comercial real sem prova de que deveria.
"""
import secrets
import json
from typing import Optional, Union

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session

from .db import get_db
from .config import get_settings
from .affiliate_links import get_monetized_offer, validate_affiliate_url, InvalidAffiliateUrlError
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
    partner: str = Query(default="cobasi", description="cobasi | petz | petlove"),
    lead_id: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Query de busca contextual (ex: marca de ração)"),
    db: Session = Depends(get_db),
) -> Union[RedirectResponse, JSONResponse]:
    """Redireciona para loja parceira com tracking de lead.

    - partner=cobasi  → get_monetized_offer("cobasi", context="store") — gated por cobasi_affiliate_mode
    - partner=petz    → get_monetized_offer("petz", context="store") — gated por is_petz_publicly_servable()
    - partner=petlove → PETLOVE_DOG_LIFE_URL (sem gate equivalente ainda — ver docstring do módulo)
    - partner=amazon  → desativado; retorna 503 controlado
    - q=brand         → appends ?q=brand to affiliate URL for contextual search
    - Se URL não configurada/não monetizável → 503 JSON (não 500)

    `dest` foi removido (25/08/2026): era um open redirect — nunca use
    entrada do chamador como destino de redirect.
    """
    from urllib.parse import quote as _quote
    settings = get_settings()

    partner = partner.lower().strip()
    if partner == "cobasi":
        offer = get_monetized_offer(db, "cobasi", context="store")
        affiliate_url = offer["url"] if offer else None
        target = "cobasi"
    elif partner == "petlove":
        affiliate_url = settings.petlove_dog_life_url
        target = "petlove"
    elif partner == "amazon":
        return _no_url_response("amazon")
    else:
        # default: petz
        offer = get_monetized_offer(db, "petz", context="store")
        affiliate_url = offer["url"] if offer else None
        target = "petz"

    lead_id = _ensure_lead(lead_id, db, source="handoff_shop", cta_type="shop_redirect", target=target)

    if not affiliate_url:
        return _no_url_response(partner)

    # Append contextual search query when provided
    if q and q.strip():
        sep = "&" if "?" in affiliate_url else "?"
        affiliate_url = f"{affiliate_url}{sep}q={_quote(q.strip())}"

    try:
        validate_affiliate_url(affiliate_url)
    except InvalidAffiliateUrlError:
        return _no_url_response(partner)

    return RedirectResponse(url=affiliate_url, status_code=302)


@router.get("/doglife", response_model=None)
def handoff_doglife(
    lead_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> Union[RedirectResponse, JSONResponse]:
    """Redireciona para plano PetLove Dog Life com tracking de lead.

    - Lê PETLOVE_DOG_LIFE_URL do ambiente.
    - Se URL não configurada → 503 JSON (não 500)

    `dest` foi removido (25/08/2026) — era um open redirect (ver
    handoff_shop acima).
    """
    settings = get_settings()

    affiliate_url = settings.petlove_dog_life_url
    lead_id = _ensure_lead(lead_id, db, source="handoff_doglife", cta_type="doglife_redirect", target="petlove")

    if not affiliate_url:
        return _no_url_response("petlove_doglife")

    try:
        validate_affiliate_url(affiliate_url)
    except InvalidAffiliateUrlError:
        return _no_url_response("petlove_doglife")

    return RedirectResponse(url=affiliate_url, status_code=302)
