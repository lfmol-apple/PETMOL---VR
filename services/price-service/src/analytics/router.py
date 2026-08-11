"""
Analytics router — Motor de Intenção.

POST /api/analytics/click  — registra evento de funil anônimo.
"""
import hashlib
import json
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from .models import AnalyticsEvent

router = APIRouter(prefix="/analytics", tags=["Analytics"])


# ── Schemas ───────────────────────────────────────────────────────────────

class ClickRequest(BaseModel):
    source: str          # rg_public | home | sos | vaccines | rg_generator
    cta_type: str        # rg_share | found_pet | create_rg | benefits_view | shop_redirect | doglife_redirect
    target: Optional[str] = None   # petz | cobasi | petlove | internal
    link_type: Optional[str] = None  # affiliate_product | affiliate_marketplace_offer | affiliate_store | affiliate_service | affiliate_search | direct
    pet_id: Optional[str] = None
    rg_public_id: Optional[str] = None
    metadata: Optional[dict] = None  # livre, sem PII


class ClickResponse(BaseModel):
    lead_id: str


# ── Util ──────────────────────────────────────────────────────────────────

def _ip_hash(ip: Optional[str]) -> Optional[str]:
    """SHA-256 do IP, truncado para 16 chars (não reversível)."""
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


def _truncate_ua(ua: Optional[str]) -> Optional[str]:
    if not ua:
        return None
    return ua[:255]


# ── Endpoint ──────────────────────────────────────────────────────────────

@router.post("/click", response_model=ClickResponse, status_code=201)
def record_click(
    body: ClickRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Registra evento de intenção anônimo.

    - Não armazena PII (email/telefone).
    - ip_hash = SHA-256[:16], não reversível.
    - Gera e retorna lead_id para rastreio agregado.
    """
    lead_id = secrets.token_hex(16)  # 32-char hex

    meta_str: Optional[str] = None
    if body.metadata:
        try:
            # Remover campos que possam conter PII
            safe_meta = {k: v for k, v in body.metadata.items()
                         if k.lower() not in ("email", "phone", "cpf", "name", "nome")}
            meta_str = json.dumps(safe_meta, ensure_ascii=False)[:500]
        except Exception:
            pass

    client_ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    event = AnalyticsEvent(
        lead_id=lead_id,
        source=body.source[:40],
        cta_type=body.cta_type[:40],
        target=body.target[:60] if body.target else None,
        link_type=body.link_type[:32] if body.link_type else None,
        pet_id=body.pet_id,
        rg_public_id=body.rg_public_id,
        metadata_json=meta_str,
        user_agent=_truncate_ua(ua),
        ip_hash=_ip_hash(client_ip),
    )
    try:
        db.add(event)
        db.commit()
    except Exception:
        db.rollback()
        # Não travar o cliente por falha de analytics
        pass

    return ClickResponse(lead_id=lead_id)
