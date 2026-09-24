"""Uma linha por tentativa de publicar uma foto — auditoria completa das
decisões de moderação. Nunca guarda a imagem em si aqui, só a chave de
armazenamento (privada até aprovar) e o resultado estruturado da IA.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

# Cada fluxo real do app que aceita uma foto pra exibição pública.
CONTEXTS = ("pet_profile", "missing_pet_alert", "pet_sighting")
STATUSES = ("approved", "rejected", "pending")


class PhotoModerationDecision(Base):
    __tablename__ = "photo_moderation_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))

    # De onde veio / a quem pertence a decisão
    context: Mapped[str] = mapped_column(String(30), nullable=False, index=True)   # CONTEXTS
    entity_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # "pet" | "missing_pet" | "pet_sighting"
    entity_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    uploader_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    # Onde o arquivo está — chave PRIVADA (fora do caminho estático público)
    # enquanto status != "approved". `final_public_key` só é preenchida
    # quando a foto é promovida pro lugar público de verdade.
    storage_key: Mapped[str] = mapped_column(String(300), nullable=False)
    final_public_key: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    byte_size: Mapped[Optional[int]] = mapped_column(nullable=True)

    # Resultado estruturado da IA (ver moderation/classifier.py)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # STATUSES — decisão EFETIVA (após eventual revisão humana)
    ai_decision: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # o que a IA respondeu, antes de qualquer revisão
    ai_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_species: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    ai_image_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # real_photo | drawing | meme | synthetic | ...
    ai_is_main_subject: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    ai_flags_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON curto com os booleans de conteúdo impróprio
    ai_unavailable: Mapped[bool] = mapped_column(Boolean, default=False)  # IA fora do ar nesta tentativa -> sempre "pending", nunca aprova sozinho

    # Revisão humana (opcional — só quando um admin decide manualmente)
    reviewed_by_admin_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Foto RECUSADA guardada (privada, só admin, apaga sozinha em ~30 dias) pra revisão
    # humana. Nunca True para recusas por conteúdo sensível (ver classifier.is_sensitive).
    image_retained: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    # Quantas vezes o admin abriu a foto recusada — na 2ª o arquivo é apagado (ver service.REJECTED_IMAGE_MAX_VIEWS).
    image_views: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)

    upload_ip_hash: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
