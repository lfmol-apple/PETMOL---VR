"""POST /support/feedback — "Fale com o PETMOL".

Autenticação OPCIONAL de propósito: uma dúvida ou problema pode acontecer
antes do login (ex: durante o cadastro) — nunca bloquear o envio por falta
de sessão. Quando há sessão válida, o user_id é preenchido; sem ela, a
mensagem ainda é aceita e guardada anônima.
"""
from __future__ import annotations

import logging
from html import escape
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fastapi import Depends

from ..config import get_settings
from ..db import get_db
from ..mailer import send_mail
from ..user_auth.models import User
from ..user_auth.router import COOKIE_NAME
from ..user_auth.security import decode_token
from .models import CATEGORIES, SupportFeedback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["Support"])

_CATEGORY_LABEL = {"suggestion": "Sugestão", "bug": "Problema", "help": "Ajuda"}


def _notify_inbox(entry: SupportFeedback, user: Optional[User]) -> None:
    """Entrega a mensagem na caixa da gerência. Best-effort: o feedback já
    está salvo no banco; falha de e-mail nunca derruba o envio do tutor."""
    inbox = get_settings().contact_inbox_email
    if not inbox:
        return

    who_name = ((user.name or "").strip() if user else "") or "Tutor"
    who_email = ((user.email or "").strip() if user else "") or "(sem login)"
    label = _CATEGORY_LABEL.get(entry.category, entry.category)
    subject = f"[Fale com o Petmol] {label} — {who_name}"
    meta = (
        f"Categoria: {label}\n"
        f"De: {who_name} <{who_email}>\n"
        f"Usuário: {user.id if user else '—'}\n"
        f"Plataforma: {entry.platform or '—'} · versão {entry.app_version or '—'}\n"
        f"ID do registro: {entry.id}\n"
    )
    body_text = f"{meta}\n{entry.message}\n"
    body_html = (
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">'
        f'<p style="margin:0 0 4px"><strong>{escape(label)}</strong> — '
        f'{escape(who_name)} &lt;{escape(who_email)}&gt;</p>'
        f'<p style="margin:0 0 12px;color:#6b7280;font-size:12px">'
        f'Usuário: {escape(str(user.id) if user else "—")} · '
        f'{escape(entry.platform or "—")} · versão {escape(entry.app_version or "—")} · '
        f'registro {escape(entry.id)}</p>'
        f'<div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #eee;'
        f'border-radius:10px;padding:12px 14px">{escape(entry.message)}</div>'
        '</div>'
    )
    reply_to = who_email if user and user.email else None
    try:
        send_mail(to=inbox, subject=subject, body_text=body_text, body_html=body_html, reply_to=reply_to)
    except Exception as exc:  # pragma: no cover - defensivo
        logger.warning("support: notificação por e-mail falhou: %s", exc)


def _optional_user(
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> Optional[User]:
    token_to_use = None
    if authorization and authorization.startswith("Bearer "):
        token_to_use = authorization.replace("Bearer ", "")
    elif token:
        token_to_use = token
    if not token_to_use:
        return None
    token_data = decode_token(token_to_use)
    if not token_data or not token_data.user_id:
        return None
    return db.query(User).filter(User.id == token_data.user_id).first()


class SupportFeedbackCreate(BaseModel):
    category: str = Field(..., description="suggestion | bug | help")
    message: str = Field(..., min_length=1, max_length=4000)
    platform: Optional[str] = Field(default=None, max_length=20)
    app_version: Optional[str] = Field(default=None, max_length=40)


class SupportFeedbackOut(BaseModel):
    id: str
    status: str


@router.post("/feedback", response_model=SupportFeedbackOut, status_code=status.HTTP_201_CREATED)
def submit_support_feedback(
    payload: SupportFeedbackCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(_optional_user),
):
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category deve ser um de: {', '.join(CATEGORIES)}")
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="message vazio")

    entry = SupportFeedback(
        user_id=user.id if user else None,
        category=payload.category,
        message=payload.message.strip(),
        platform=payload.platform,
        app_version=payload.app_version,
        status="new",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    _notify_inbox(entry, user)

    return SupportFeedbackOut(id=entry.id, status=entry.status)
