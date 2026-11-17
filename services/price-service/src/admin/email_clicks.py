"""Cliques em links de e-mail de campanha: registra e segue para o destino. Público (sem login), endereço ASSINADO por
pessoa e campanha (HMAC), destino FIXO no servidor (não é um redirecionador aberto).

Limite honesto: alguns provedores (Gmail, Outlook, antivírus) abrem os links sozinhos para checar segurança, então a
contagem pode ser um pouco maior que a real. Abertura NÃO é medida (o Apple Mail esconde; seria número enganoso).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import Column, DateTime, String

from ..config import get_settings
from ..db import Base, SessionLocal, engine
from .email_gratuito import LINKS
from .email_pet_photo import PUBLIC_BASE

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/email", tags=["Email click"])



class EmailClick(Base):
    __tablename__ = "email_clicks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    campaign = Column(String(40), nullable=False, index=True)   # mesmo valor de ActivationCampaignContact.campaign
    user_id = Column(String(36), nullable=False, index=True)
    link = Column(String(20), nullable=False)
    clicked_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


Base.metadata.create_all(bind=engine, tables=[EmailClick.__table__])


def click_sig(campaign: str, user_id: str) -> str:
    key = (get_settings().jwt_secret or "").encode()
    return hmac.new(key, f"email-click:{campaign}:{user_id}".encode(), hashlib.sha256).hexdigest()[:24]


def click_url(campaign: str, user_id: str, link: str) -> str:
    return f"{PUBLIC_BASE}/api/v1/email/click/{campaign}/{user_id}/{click_sig(campaign, user_id)}?l={link}"


@router.get("/click/{campaign}/{user_id}/{sig}")
def track_click(campaign: str, user_id: str, sig: str, l: str = "botao"):
    if not hmac.compare_digest(sig, click_sig(campaign, user_id)):
        raise HTTPException(404, "Link inválido.")
    link = l if l in LINKS else "botao"
    from .email_gratuito import destination
    try:
        db = SessionLocal()
        try:
            db.add(EmailClick(campaign=campaign, user_id=user_id, link=link))
            db.commit()
        finally:
            db.close()
    except Exception:  # noqa: BLE001 — falha de registro nunca impede a pessoa de chegar ao app
        logger.exception("email_click: falha ao registrar %s/%s", campaign, user_id)
    return RedirectResponse(destination(link), status_code=302)
