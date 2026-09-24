"""Orquestra o fluxo obrigatório: SANITIZAÇÃO -> CLASSIFICAÇÃO POR IA ->
DECISÃO -> PUBLICAÇÃO (só se aprovado). Ponto único que todo fluxo de
upload de foto pública do app (perfil do pet, Pet Sumido, avistamento)
deve chamar — nenhum deles grava a foto direto em disco/nuvem por conta
própria mais.
"""
from __future__ import annotations

import hashlib
import logging
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
) -> ModerationOutcome:
    """Ponto único de entrada. Levanta `ModerationRejected` se a foto for
    recusada (o chamador decide como comunicar isso — normalmente 422 com
    `REJECTED_MESSAGE`). Nunca levanta por causa da IA estar fora do ar —
    nesse caso a decisão é sempre "pending", auditada como tal."""
    if context not in PUBLIC_PREFIX_BY_CONTEXT:
        raise ValueError(f"contexto de moderação desconhecido: {context}")

    abuse_key = f"{context}:{uploader_user_id or _ip_hash(uploader_ip) or 'anon'}"
    _check_repeat_rejection_abuse(abuse_key)

    # 1) Sanitização real — decodifica, remove EXIF/GPS, reencoda. Levanta
    # HTTPException (400/413) sozinha se não for uma imagem de verdade.
    sanitized = sanitize_image(raw_bytes)

    # 2) Classificação por IA + decisão determinística.
    decision, classification, ai_unavailable = await classify_and_decide(sanitized.bytes_)

    key = f"{uuid.uuid4().hex}.jpg"

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
