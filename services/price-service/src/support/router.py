"""POST /support/feedback — "Fale com o PETMOL".

Autenticação OPCIONAL de propósito: uma dúvida ou problema pode acontecer
antes do login (ex: durante o cadastro) — nunca bloquear o envio por falta
de sessão. Quando há sessão válida, o user_id é preenchido; sem ela, a
mensagem ainda é aceita e guardada anônima.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fastapi import Depends

from ..db import get_db
from ..user_auth.models import User
from ..user_auth.router import COOKIE_NAME
from ..user_auth.security import decode_token
from .models import CATEGORIES, SupportFeedback

router = APIRouter(prefix="/support", tags=["Support"])


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
    return SupportFeedbackOut(id=entry.id, status=entry.status)
