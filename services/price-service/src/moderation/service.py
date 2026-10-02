"""Orquestra o fluxo obrigatório: SANITIZAÇÃO -> CLASSIFICAÇÃO POR IA ->
DECISÃO -> PUBLICAÇÃO (só se aprovado). Ponto único que todo fluxo de
upload de foto pública do app (perfil do pet, Pet Sumido, avistamento)
deve chamar — nenhum deles grava a foto direto em disco/nuvem por conta
própria mais.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import threading
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import storage as review_storage
from .classifier import APPROVED, PENDING, REJECTED, classify_and_decide, flags_json, is_sensitive
from .models import PhotoModerationDecision
from .sanitize import sanitize_image

logger = logging.getLogger(__name__)

REJECTED_MESSAGE = "Não foi possível aprovar esta imagem. Envie uma fotografia real do seu pet, sem conteúdo impróprio."
PENDING_MESSAGE = "Esta fotografia precisa de uma verificação adicional. Você pode enviar outra imagem enquanto isso."

PUBLIC_PREFIX_BY_CONTEXT = {
    "pet_profile": "pets",
    "missing_pet_alert": "pets",
    "pet_sighting": "pet_sightings",
}


# Foto recusada (não sensível) fica guardada em área PRIVADA só pro admin conferir a
# decisão da IA, e é apagada depois deste prazo.
REJECTED_IMAGE_RETENTION_DAYS = 30
# ...e também é apagada depois de abrir esta quantidade de vezes (o que vier primeiro).
REJECTED_IMAGE_MAX_VIEWS = 2


def purge_expired_rejected_images(db: Session, *, limit: int = 100) -> int:
    """Apaga o arquivo das recusadas guardadas há mais de REJECTED_IMAGE_RETENTION_DAYS."""
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(days=REJECTED_IMAGE_RETENTION_DAYS)
    rows = (
        db.query(PhotoModerationDecision)
        .filter(
            PhotoModerationDecision.status == REJECTED,
            PhotoModerationDecision.image_retained.is_(True),
            PhotoModerationDecision.created_at < cutoff,
        )
        .limit(limit)
        .all()
    )
    for r in rows:
        try:
            review_storage.discard_pending(r.storage_key)
        finally:
            r.image_retained = False
            db.add(r)
    if rows:
        db.commit()
    return len(rows)


class ModerationRejected(Exception):
    """A foto foi recusada — o chamador deve devolver isso como erro pro
    tutor, sem salvar nada em nenhum lugar público."""

    def __init__(self, reason: str, decision_id: str):
        self.reason = reason
        self.decision_id = decision_id
        super().__init__(reason)


@dataclass
class ModerationOutcome:
    status: str                       # "approved" | "pending"
    decision_id: str
    public_key: Optional[str] = None  # só quando status == "approved"
    public_url_path: Optional[str] = None  # ex: "pets/xxx.jpg" — o que os fluxos existentes retornavam como photo_url


# ── Abuso: repetidas rejeições no mesmo IP/uploader, mesma janela ─────────
_rejection_events: dict[str, list[float]] = defaultdict(list)
REJECTION_WINDOW_SECONDS = 3600
REJECTION_LOCKOUT_THRESHOLD = 5  # 5 rejeições numa hora -> passa a exigir mais espaço entre tentativas
REJECTION_LOCKOUT_SECONDS = 300


def _ip_hash(ip: Optional[str]) -> Optional[str]:
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


def _check_repeat_rejection_abuse(abuse_key: str) -> None:
    now = time.time()
    events = [t for t in _rejection_events.get(abuse_key, []) if t > now - REJECTION_WINDOW_SECONDS]
    _rejection_events[abuse_key] = events
    if len(events) >= REJECTION_LOCKOUT_THRESHOLD and events and now - events[-1] < REJECTION_LOCKOUT_SECONDS:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Muitas imagens recusadas em pouco tempo. Aguarde alguns minutos antes de tentar de novo.",
            headers={"Retry-After": str(REJECTION_LOCKOUT_SECONDS)},
        )


def _register_rejection(abuse_key: str) -> None:
    _rejection_events[abuse_key].append(time.time())
    if len(_rejection_events) > 5000:  # limpeza preguiçosa, mesmo padrão do resto do app
        now = time.time()
        for k in list(_rejection_events.keys()):
            _rejection_events[k] = [t for t in _rejection_events[k] if t > now - REJECTION_WINDOW_SECONDS]
            if not _rejection_events[k]:
                del _rejection_events[k]


async def moderate_upload(
    raw_bytes: bytes,
    *,
    context: str,
    db: Session,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    uploader_user_id: Optional[str] = None,
    uploader_ip: Optional[str] = None,
    publish_immediately: bool = False,
) -> ModerationOutcome:
    """Ponto único de entrada. Levanta `ModerationRejected` se a foto for
    recusada (o chamador decide como comunicar isso — normalmente 422 com
    `REJECTED_MESSAGE`). Nunca levanta por causa da IA estar fora do ar —
    nesse caso a decisão é sempre "pending", auditada como tal.

    `publish_immediately` (achado real, 02/10/2026 — cadastro de pet
    travando ~20s esperando o Gemini): publica a foto sanitizada NA HORA e
    roda a classificação em segundo plano (`_finish_optimistic_moderation`);
    se for reprovada depois, a foto pública é removida. Só pra
    `pet_profile` — missing_pet_alert/pet_sighting continuam síncronos de
    propósito (alcance público/push imediato, risco maior de mostrar algo
    impróprio por alguns segundos antes de reverter)."""
    if context not in PUBLIC_PREFIX_BY_CONTEXT:
        raise ValueError(f"contexto de moderação desconhecido: {context}")

    abuse_key = f"{context}:{uploader_user_id or _ip_hash(uploader_ip) or 'anon'}"
    _check_repeat_rejection_abuse(abuse_key)

    # 1) Sanitização real — decodifica, remove EXIF/GPS, reencoda. Levanta
    # HTTPException (400/413) sozinha se não for uma imagem de verdade.
    sanitized = sanitize_image(raw_bytes)

    key = f"{uuid.uuid4().hex}.jpg"

    if publish_immediately:
        public_prefix = PUBLIC_PREFIX_BY_CONTEXT[context]
        public_key = f"{public_prefix}/{key}"
        # promote_to_public move da área de revisão pra pública — precisa
        # existir lá primeiro, mesmo caminho do fluxo síncrono.
        review_storage.save_pending(key, sanitized.bytes_, content_type=sanitized.content_type)
        review_storage.promote_to_public(key, public_key, content_type=sanitized.content_type)
        record = PhotoModerationDecision(
            context=context,
            entity_type=entity_type,
            entity_id=entity_id,
            uploader_user_id=uploader_user_id,
            storage_key=key,
            content_type=sanitized.content_type,
            byte_size=len(sanitized.bytes_),
            status=APPROVED,
            ai_reason="publicada otimista — classificação em segundo plano ainda não terminou",
            upload_ip_hash=_ip_hash(uploader_ip),
            final_public_key=public_key,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        # Grava a foto na entidade (hoje só "pet") e COMMITA antes de
        # disparar a thread — tem que acontecer-antes do possível reverso
        # em segundo plano, senão é uma corrida de verdade: se a IA
        # responder rápido demais, a thread pode reverter ANTES deste
        # commit, e este commit reescreveria por cima o reverso.
        if entity_type == "pet" and entity_id:
            from ..pets.models import Pet
            pet_row = db.query(Pet).filter(Pet.id == entity_id).first()
            if pet_row:
                pet_row.photo = public_key
                db.commit()

        threading.Thread(
            target=_finish_optimistic_moderation,
            args=(record.id, sanitized.bytes_, sanitized.content_type, public_key, key, abuse_key, entity_id),
            daemon=True,
        ).start()
        return ModerationOutcome(status=APPROVED, decision_id=record.id, public_key=public_key, public_url_path=public_key)

    # 2) Classificação por IA + decisão determinística.
    decision, classification, ai_unavailable = await classify_and_decide(sanitized.bytes_)

    record = PhotoModerationDecision(
        context=context,
        entity_type=entity_type,
        entity_id=entity_id,
        uploader_user_id=uploader_user_id,
        storage_key=key,
        content_type=sanitized.content_type,
        byte_size=len(sanitized.bytes_),
        status=decision.status,
        ai_decision=decision.ai_decision,
        ai_reason=decision.reason,
        ai_confidence=classification.get("confidence") if classification else None,
        ai_species=classification.get("species") if classification else None,
        ai_image_type=classification.get("image_type") if classification else None,
        ai_is_main_subject=classification.get("pet_is_main_subject") if classification else None,
        ai_flags_json=flags_json(classification) if classification else None,
        ai_unavailable=ai_unavailable,
        upload_ip_hash=_ip_hash(uploader_ip),
    )

    if decision.status == REJECTED:
        # Nada vira público. Recusa NÃO sensível (ex.: "não é um pet") guarda a versão
        # sanitizada em área privada por 30 dias, só pro admin conferir a IA; recusa por
        # conteúdo sensível (nudez, violência, menores) nunca é guardada.
        _register_rejection(abuse_key)
        if not is_sensitive(classification):
            try:
                review_storage.save_pending(key, sanitized.bytes_, content_type=sanitized.content_type)
                record.image_retained = True
            except Exception:  # noqa: BLE001 — guardar a foto é best-effort; a recusa não pode falhar por isso
                logger.warning("Não foi possível guardar a foto recusada pra revisão", exc_info=True)
        db.add(record)
        db.commit()
        try:
            purge_expired_rejected_images(db)
        except Exception:  # noqa: BLE001
            logger.warning("Falha ao limpar fotos recusadas antigas", exc_info=True)
        logger.info("Moderação REJEITOU foto (context=%s, motivo=%s)", context, decision.reason)
        raise ModerationRejected(decision.reason, record.id)

    # approved ou pending: a versão sanitizada vai pra área de revisão
    # primeiro — mesmo quando aprovada na hora, isso mantém um único
    # caminho de código (promoção) em vez de dois jeitos de escrever a
    # foto final.
    review_storage.save_pending(key, sanitized.bytes_, content_type=sanitized.content_type)

    if decision.status == PENDING:
        db.add(record)
        db.commit()
        logger.info(
            "Moderação pediu REVISÃO (context=%s, motivo=%s, ia_indisponivel=%s)",
            context, decision.reason, ai_unavailable,
        )
        return ModerationOutcome(status=PENDING, decision_id=record.id)

    # Aprovada — promove pro caminho público de verdade.
    public_prefix = PUBLIC_PREFIX_BY_CONTEXT[context]
    public_key = f"{public_prefix}/{key}"
    review_storage.promote_to_public(key, public_key, content_type=sanitized.content_type)
    record.final_public_key = public_key
    db.add(record)
    db.commit()
    logger.info("Moderação APROVOU foto (context=%s)", context)
    return ModerationOutcome(
        status=APPROVED,
        decision_id=record.id,
        public_key=public_key,
        public_url_path=public_key,
    )


def _finalize_rejected_background(
    db: Session, record: PhotoModerationDecision, classification: dict,
    sanitized_bytes: bytes, key: str, abuse_key: str, public_key: str, entity_id: Optional[str],
) -> None:
    """Mesma lógica do ramo REJECTED síncrono (registra abuso, guarda a
    foto pra revisão se não for sensível, limpa expiradas) — só que sem
    `raise` (ninguém está esperando a resposta) e desfazendo a publicação
    otimista: apaga o arquivo público e tira a foto do pet, se ainda for
    essa a atual (o tutor pode ter trocado de novo nesse meio tempo)."""
    from ..pets.models import Pet
    from ..pets.upload import delete_pet_photo

    _register_rejection(abuse_key)
    if not is_sensitive(classification):
        try:
            review_storage.save_pending(key, sanitized_bytes, content_type=record.content_type)
            record.image_retained = True
        except Exception:  # noqa: BLE001 — guardar é best-effort
            logger.warning("Não foi possível guardar a foto recusada pra revisão (otimista)", exc_info=True)
    record.status = REJECTED
    db.add(record)
    db.commit()
    try:
        purge_expired_rejected_images(db)
    except Exception:  # noqa: BLE001
        logger.warning("Falha ao limpar fotos recusadas antigas", exc_info=True)

    delete_pet_photo(public_key)
    if entity_id:
        pet = db.query(Pet).filter(Pet.id == entity_id).first()
        if pet and pet.photo == public_key:
            pet.photo = None
            db.commit()
    logger.warning(
        "Moderação (otimista) REJEITOU foto já publicada — removida (context=%s, motivo=%s, entity_id=%s)",
        record.context, record.ai_reason, entity_id,
    )


def _finish_optimistic_moderation(
    decision_id: str, sanitized_bytes: bytes, content_type: str,
    public_key: str, key: str, abuse_key: str, entity_id: Optional[str],
) -> None:
    """Roda em thread separada, depois que a resposta HTTP de
    `publish_immediately=True` já foi enviada. Nunca derruba o processo —
    falha aqui só fica no log, a foto continua publicada como estava."""
    from ..db import SessionLocal

    try:
        decision, classification, ai_unavailable = asyncio.run(classify_and_decide(sanitized_bytes))
    except Exception:  # noqa: BLE001
        logger.exception("Classificação em segundo plano falhou (decision_id=%s)", decision_id)
        return

    db = SessionLocal()
    try:
        record = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.id == decision_id).first()
        if not record:
            return
        record.ai_decision = decision.ai_decision
        record.ai_reason = decision.reason
        record.ai_confidence = classification.get("confidence") if classification else None
        record.ai_species = classification.get("species") if classification else None
        record.ai_image_type = classification.get("image_type") if classification else None
        record.ai_is_main_subject = classification.get("pet_is_main_subject") if classification else None
        record.ai_flags_json = flags_json(classification) if classification else None
        record.ai_unavailable = ai_unavailable

        if decision.status == REJECTED:
            _finalize_rejected_background(db, record, classification, sanitized_bytes, key, abuse_key, public_key, entity_id)
        else:
            # Aprovada de verdade, ou "pending" (IA indisponível/ambígua) —
            # nos dois casos a foto JÁ está pública (publicação otimista);
            # só grava o resultado da IA pra auditoria, sem desfazer nada.
            db.add(record)
            db.commit()
            logger.info("Moderação (otimista) confirmou a foto (status_ia=%s, entity_id=%s)", decision.status, entity_id)
    finally:
        db.close()
