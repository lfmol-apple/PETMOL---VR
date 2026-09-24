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

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..admin.deps import get_current_admin, get_current_admin_or_readonly_key
from . import storage as review_storage
from .classifier import APPROVED, PENDING, REJECTED, SENSITIVE_FLAGS
from .service import REJECTED_IMAGE_MAX_VIEWS
from .models import PhotoModerationDecision

router = APIRouter(prefix="/v1/admin/moderation", tags=["Admin Moderation"])

_ReadAuth = Depends(get_current_admin_or_readonly_key)
_WriteAuth = Depends(get_current_admin)


def _image_note(d: PhotoModerationDecision) -> Optional[str]:
    """Por que uma decisão não tem imagem pra mostrar (só quando isso precisa de explicação)."""
    if d.status != REJECTED or d.image_retained:
        return None
    if (d.image_views or 0) >= REJECTED_IMAGE_MAX_VIEWS:
        return f"Foto apagada automaticamente após {REJECTED_IMAGE_MAX_VIEWS} visualizações."
    try:
        flags = json.loads(d.ai_flags_json or "{}")
    except ValueError:
        flags = {}
    if any(flags.get(f) for f in SENSITIVE_FLAGS):
        return "Conteúdo sensível — a imagem não é guardada, por segurança."
    return "Imagem não disponível: recusada antes de passarmos a guardar as fotos recusadas, ou já apagada (guardamos por 30 dias)."


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
        # pendente: sempre tem arquivo; recusada: só se foi guardada (não sensível, < 30 dias);
        # aprovada: já é pública — `photo_key` é a chave pública pra montar a URL normal.
        "has_image": True if d.status == PENDING else (bool(d.image_retained) if d.status == REJECTED else False),
        "photo_key": d.final_public_key if d.status == APPROVED else None,
        "image_note": _image_note(d),
        "image_views_left": max(0, REJECTED_IMAGE_MAX_VIEWS - (d.image_views or 0)) if (d.status == REJECTED and d.image_retained) else None,
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
    from .service import purge_expired_rejected_images

    try:
        purge_expired_rejected_images(db)
    except Exception:  # noqa: BLE001 — limpeza é best-effort
        pass
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

    if d.status == REJECTED:
        # Recusada: a foto só pode ser aberta REJECTED_IMAGE_MAX_VIEWS vezes; a última abertura
        # entrega os bytes e apaga o arquivo (não fica ocupando o armazenamento).
        if not d.image_retained:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não disponível (já apagada ou nunca guardada)")
        data = review_storage.read_any(d.storage_key)
        if data is None:
            d.image_retained = False
            db.add(d)
            db.commit()
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo da foto não encontrado (pode já ter sido limpo)")
        d.image_views = (d.image_views or 0) + 1
        if d.image_views >= REJECTED_IMAGE_MAX_VIEWS:
            review_storage.discard_pending(d.storage_key)
            d.image_retained = False
        db.add(d)
        db.commit()
        return Response(content=data, media_type=d.content_type or "image/jpeg", headers={"Cache-Control": "no-store"})

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


class RemovePetPhotoBody(BaseModel):
    note: Optional[str] = None


@router.post("/pets/{pet_id}/remove-photo")
def remove_pet_photo_and_notify(
    pet_id: str,
    body: RemovePetPhotoBody,
    db: Session = Depends(get_db),
    admin=_WriteAuth,
):
    """Foto de perfil que não é de um pet e já está publicada (ex.: enviada
    antes da moderação por IA existir): o admin vê a foto no painel,
    confirma, e isto (1) apaga o arquivo do armazenamento, (2) limpa toda
    referência no banco (perfil do pet, alertas de Pet Sumido que herdaram
    a foto, decisões de moderação) e (3) avisa o tutor com push + e-mail,
    com gentileza — sem acusar ninguém, é só "esse espaço é pra foto do
    seu pet". Escrita: só JWT de admin (a chave de leitura nunca chega
    aqui), e a decisão fica registrada com quem fez."""
    from ..admin_alerts import first_name
    from ..mailer import send_mail
    from ..missing_pets import MissingPet
    from ..notifications import push_to_user
    from ..pets.models import Pet
    from ..pets.upload import delete_pet_photo
    from ..user_auth.models import User

    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pet não encontrado")
    old_photo = pet.photo
    if not old_photo:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Este pet não tem foto de perfil")
    tutor = db.query(User).filter(User.id == pet.user_id).first()
    pet_name = pet.name or "seu pet"
    now = datetime.now(timezone.utc)
    admin_id = str(admin[0].id)

    # 1) referências no banco — alertas de Pet Sumido que copiaram a foto
    db.query(MissingPet).filter(MissingPet.photo_url == old_photo).update(
        {"photo_url": None}, synchronize_session=False
    )
    # decisões de moderação: registra como rejeitada (só metadados — a
    # imagem em si é apagada abaixo); sem decisão prévia (foto anterior à
    # moderação por IA), cria o registro de auditoria.
    decisions = (
        db.query(PhotoModerationDecision)
        .filter(
            ((PhotoModerationDecision.entity_type == "pet") & (PhotoModerationDecision.entity_id == pet_id))
            | (PhotoModerationDecision.final_public_key == old_photo)
        )
        .all()
    )
    if not decisions:
        decisions = [PhotoModerationDecision(
            context="pet_profile", entity_type="pet", entity_id=pet_id,
            uploader_user_id=str(pet.user_id), storage_key="removed", status=REJECTED,
            ai_reason="Foto anterior à moderação por IA — removida manualmente por admin.",
        )]
    for d in decisions:
        if d.status == PENDING:
            review_storage.discard_pending(d.storage_key)
        d.status = REJECTED
        d.final_public_key = None
        d.reviewed_by_admin_id = admin_id
        d.reviewed_at = now
        d.review_note = body.note or "Não é foto de pet — removida por admin."
        db.add(d)
    pet.photo = None
    db.commit()

    # 2) arquivo (depois do commit: se o storage falhar, o banco já está limpo)
    delete_pet_photo(old_photo)

    # 3) aviso ao tutor — push e e-mail independentes, best-effort
    push_sent = 0
    email_sent = False
    if tutor:
        try:
            push_sent = push_to_user(str(tutor.id), {
                "title": "Sua foto não foi aprovada",
                "body": f"Este espaço é reservado para a foto do seu pet 🐾 Que tal enviar uma foto de {pet_name}?",
                "tag": "petmol-photo-removed",
                "data": {"url": "/home"},
            }) or 0
        except Exception:
            push_sent = 0
        try:
            greeting = first_name(tutor.name)
            email_sent = bool(send_mail(
                to=tutor.email,
                subject="PETMOL — sua foto não foi aprovada",
                body_text=(
                    f"Olá{', ' + greeting if greeting else ''}!\n\n"
                    f"A foto enviada no perfil de {pet_name} não foi aprovada, porque esse espaço é "
                    "reservado para a foto do seu pet. Já removemos a imagem.\n\n"
                    f"Quando quiser, é só abrir o PETMOL e enviar uma foto de {pet_name} — "
                    "vamos adorar ver!\n\n"
                    "Um abraço,\nEquipe PETMOL"
                ),
            ))
        except Exception:
            email_sent = False

    return {
        "ok": True,
        "pet_id": pet_id,
        "photo_removed": True,
        "tutor_email": tutor.email if tutor else None,
        "push_sent": int(push_sent),
        "email_sent": email_sent,
    }


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
