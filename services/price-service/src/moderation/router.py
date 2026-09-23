"""Painel de moderação — Mission Control.

Leitura (listar fotos por status) usa `get_current_admin_or_readonly_key`
(mesmo padrão do resto do BI admin — JWT ou a chave de operação de só
leitura). Aprovar/rejeitar são ESCRITAS: só `get_current_admin` (JWT puro)
— a chave de API nunca guarda quem decidiu, e aqui a decisão precisa de
rastro de autoria.

Nenhuma foto pendente ou rejeitada tem URL pública — a única forma de vê-
la é `GET /v1/admin/moderation/{id}/image`, autenticado.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..admin.deps import get_current_admin, get_current_admin_or_readonly_key
from . import storage as review_storage
from .classifier import APPROVED, PENDING, REJECTED
from .models import PhotoModerationDecision

router = APIRouter(prefix="/v1/admin/moderation", tags=["Admin Moderation"])

_ReadAuth = Depends(get_current_admin_or_readonly_key)
_WriteAuth = Depends(get_current_admin)


def _decision_out(d: PhotoModerationDecision) -> dict:
    return {
        "id": d.id,
        "context": d.context,
        "entity_type": d.entity_type,
        "entity_id": d.entity_id,
        "uploader_user_id": d.uploader_user_id,
        "status": d.status,
        "ai_decision": d.ai_decision,
        "ai_reason": d.ai_reason,
        "ai_confidence": d.ai_confidence,
        "ai_species": d.ai_species,
        "ai_image_type": d.ai_image_type,
        "ai_is_main_subject": d.ai_is_main_subject,
        "ai_unavailable": d.ai_unavailable,
        "reviewed_by_admin_id": d.reviewed_by_admin_id,
        "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
        "review_note": d.review_note,
        "has_image": d.status != APPROVED,  # aprovadas já têm URL pública normal — não precisam desse endpoint
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("/summary")
def moderation_summary(db: Session = Depends(get_db), _=_ReadAuth):
    counts = {}
    for st in (APPROVED, REJECTED, PENDING):
        counts[st] = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.status == st).count()
    return {
        "approved": counts[APPROVED],
        "rejected": counts[REJECTED],
        "pending": counts[PENDING],
        "total": sum(counts.values()),
    }


@router.get("")
def list_decisions(
    status_filter: Optional[str] = Query(None, alias="status"),
    context: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _=_ReadAuth,
):
    q = db.query(PhotoModerationDecision)
    if status_filter:
        if status_filter not in (APPROVED, REJECTED, PENDING):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "status inválido")
        q = q.filter(PhotoModerationDecision.status == status_filter)
    if context:
        q = q.filter(PhotoModerationDecision.context == context)
    total = q.count()
    rows = (
        q.order_by(PhotoModerationDecision.created_at.desc())
        .offset(offset).limit(limit).all()
    )
    return {"total": total, "items": [_decision_out(r) for r in rows]}


@router.get("/{decision_id}/image")
def view_review_image(
    decision_id: str,
    db: Session = Depends(get_db),
    admin=_WriteAuth,  # ver foto pendente/rejeitada também exige JWT de admin de verdade, não só a chave de leitura
):
    """Única forma de ver uma foto pendente ou rejeitada — nunca tem URL
    pública. Fotos aprovadas usam a URL pública normal do app."""
    d = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.id == decision_id).first()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decisão não encontrada")
    if d.status == APPROVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Foto aprovada já tem URL pública — use photo_url normal")

    signed = review_storage.signed_review_url(d.storage_key)
    if signed:
        return RedirectResponse(signed, status_code=302)

    data = review_storage.read_pending(d.storage_key)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo da foto não encontrado (pode já ter sido limpo)")

    def _iter():
        yield data

    return StreamingResponse(_iter(), media_type=d.content_type or "image/jpeg")


class ReviewDecisionBody(BaseModel):
    note: Optional[str] = None


@router.post("/{decision_id}/approve")
def approve_decision(
    decision_id: str,
    body: ReviewDecisionBody,
    db: Session = Depends(get_db),
    admin=_WriteAuth,
):
    d = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.id == decision_id).first()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decisão não encontrada")
    if d.status == APPROVED:
        return _decision_out(d)
    if d.status == REJECTED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Foto já rejeitada — não é possível aprovar sem novo envio")

    from .service import PUBLIC_PREFIX_BY_CONTEXT

    public_prefix = PUBLIC_PREFIX_BY_CONTEXT.get(d.context, "pets")
    public_key = f"{public_prefix}/{d.storage_key}"
    try:
        review_storage.promote_to_public(d.storage_key, public_key, content_type=d.content_type or "image/jpeg")
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo da foto não encontrado (pode já ter sido limpo)")

    d.status = APPROVED
    d.final_public_key = public_key
    d.reviewed_by_admin_id = str(admin[0].id)
    d.reviewed_at = datetime.now(timezone.utc)
    d.review_note = body.note
    db.add(d)
    db.commit()
    db.refresh(d)

    _apply_approved_photo_to_entity(db, d)

    return _decision_out(d)


@router.post("/{decision_id}/reject")
def reject_decision(
    decision_id: str,
    body: ReviewDecisionBody,
    db: Session = Depends(get_db),
    admin=_WriteAuth,
):
    d = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.id == decision_id).first()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decisão não encontrada")
    if d.status == APPROVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Foto já aprovada e pública — remova pelo fluxo normal do pet/alerta, não por aqui")
    if d.status != REJECTED:
        review_storage.discard_pending(d.storage_key)

    d.status = REJECTED
    d.reviewed_by_admin_id = str(admin[0].id)
    d.reviewed_at = datetime.now(timezone.utc)
    d.review_note = body.note
    db.add(d)
    db.commit()
    db.refresh(d)
    return _decision_out(d)


def _apply_approved_photo_to_entity(db: Session, d: PhotoModerationDecision) -> None:
    """Depois de um admin aprovar manualmente uma foto que tinha ficado
    pendente, aplica ela na entidade real (pet/alerta/avistamento) — sem
    isso a aprovação ficaria só registrada aqui, sem efeito nenhum no app."""
    if not d.entity_id or not d.final_public_key:
        return
    public_url_path = d.final_public_key
    try:
        if d.entity_type == "pet":
            from ..pets.models import Pet

            pet = db.query(Pet).filter(Pet.id == d.entity_id).first()
            if pet:
                pet.photo = public_url_path
                db.add(pet)
                db.commit()
        elif d.entity_type == "missing_pet":
            from ..missing_pets import MissingPet

            mp = db.query(MissingPet).filter(MissingPet.id == d.entity_id).first()
            if mp:
                mp.photo_url = public_url_path
                db.add(mp)
                db.commit()
        # "pet_sighting": avistamentos guardam uma LISTA de fotos
        # (photo_urls, JSON) — uma aprovação tardia não tem uma posição
        # clara pra reinserir nessa lista sem arriscar reordenar/duplicar
        # o que o tutor já viu na tela. Fica registrado aqui (auditoria +
        # visível no painel), mas não altera `photo_urls` sozinho.
    except Exception:
        logger = __import__("logging").getLogger(__name__)
        logger.exception("Falha ao aplicar foto aprovada na entidade %s/%s", d.entity_type, d.entity_id)
