"""POST /support/feedback — "Fale com o PETMOL".

Autenticação OPCIONAL de propósito: uma dúvida ou problema pode acontecer
antes do login (ex: durante o cadastro) — nunca bloquear o envio por falta
de sessão. Quando há sessão válida, o user_id é preenchido; sem ela, a
mensagem ainda é aceita e guardada anônima.

A notificação por e-mail para a gerência sai FORA do request (BackgroundTasks):
o SMTP síncrono (connect + starttls + login + send) chegava a somar ~2 s por
envio em produção e, numa janela ruim do relay, podia estourar o timeout do
nginx → o navegador via 502/504 e mostrava "não deu para enviar" mesmo com a
mensagem já salva. Agora a resposta volta assim que o registro é gravado.
"""
from __future__ import annotations

import logging
from html import escape
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Cookie, Header, HTTPException, status
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


def _notify_inbox(
    *,
    entry_id: str,
    category: str,
    message: str,
    platform: Optional[str],
    app_version: Optional[str],
    user_id: Optional[str],
    user_name: Optional[str],
    user_email: Optional[str],
) -> None:
    """Entrega a mensagem na caixa da gerência. Best-effort e fora do request:
    o feedback já está salvo no banco; lentidão ou falha de e-mail nunca
    afeta a resposta HTTP do tutor.

    Recebe só valores primitivos (extraídos enquanto a sessão do banco estava
    viva) — nada de objeto ORM, que estaria destacado ao rodar aqui."""
    inbox = get_settings().contact_inbox_email
    if not inbox:
        return

    sender_email = (user_email or "").strip()
    who_name = (user_name or "").strip() or "Tutor"
    who_email = sender_email or "(sem login)"
    label = _CATEGORY_LABEL.get(category, category)
    # E-mail do tutor vai no ASSUNTO e no corpo — nunca no header Reply-To.
    # Reply-To apontando pra um endereço @gmail.com fazia a mensagem cair no
    # spam / ser tratada como auto-enviada quando o tutor era o próprio dono
    # da caixa (admin). "Claude manda anônimo e chega; usuário manda logado
    # e não chega" — a única diferença era esse header.
    subject = (
        f"[Fale com o Petmol] {label} — {who_name}"
        + (f" <{sender_email}>" if sender_email else "")
    )
    meta = (
        f"Categoria: {label}\n"
        f"De: {who_name} <{who_email}>\n"
        f"Usuário: {user_id or '—'}\n"
        f"Plataforma: {platform or '—'} · versão {app_version or '—'}\n"
        f"ID do registro: {entry_id}\n"
    )
    body_text = f"{meta}\n{message}\n"
    body_html = (
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">'
        f'<p style="margin:0 0 4px"><strong>{escape(label)}</strong> — '
        f'{escape(who_name)} &lt;{escape(who_email)}&gt;</p>'
        f'<p style="margin:0 0 12px;color:#6b7280;font-size:12px">'
        f'Usuário: {escape(user_id or "—")} · '
        f'{escape(platform or "—")} · versão {escape(app_version or "—")} · '
        f'registro {escape(entry_id)}</p>'
        f'<div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #eee;'
        f'border-radius:10px;padding:12px 14px">{escape(message)}</div>'
        '</div>'
    )
    try:
        ok = send_mail(to=inbox, subject=subject, body_text=body_text, body_html=body_html)
        if ok:
            logger.info("support: notificação entregue em %s (registro %s)", inbox, entry_id)
        else:
            logger.warning("support: notificação NÃO entregue em %s (registro %s) — ver mailer", inbox, entry_id)
    except Exception as exc:  # pragma: no cover - defensivo
        logger.warning("support: notificação por e-mail falhou (registro %s): %s", entry_id, exc)


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
    background_tasks: BackgroundTasks,
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

    # Captura os valores agora (sessão viva) e entrega o e-mail fora do request.
    background_tasks.add_task(
        _notify_inbox,
        entry_id=entry.id,
        category=entry.category,
        message=entry.message,
        platform=entry.platform,
        app_version=entry.app_version,
        user_id=user.id if user else None,
        user_name=user.name if user else None,
        user_email=user.email if user else None,
    )

    return SupportFeedbackOut(id=entry.id, status=entry.status)
