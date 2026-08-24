"""SupportFeedback — "Fale com o PETMOL" (sugestão / problema / ajuda).

Não é o mesmo sistema que src/feedback/ (correção de leitura de vacina por
IA, aprendizado de padrão) — esse aqui é suporte/produto genérico do
usuário, sem relação com o pipeline de OCR.

Minimização de dados (ver diretriz de privacidade do fechamento de
lançamento): guarda só o necessário para triagem — categoria, mensagem,
plataforma, versão do app. Nunca campos sensíveis (sem foto, sem dado de
saúde do pet, sem documento).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

CATEGORIES = ("suggestion", "bug", "help")
STATUSES = ("new", "reviewing", "planned", "resolved", "dismissed")


class SupportFeedback(Base):
    __tablename__ = "support_feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    # Opcional de propósito: "Preciso de ajuda" pode ser enviado por alguém
    # não logado (ex: dúvida durante o cadastro) — nunca exigir login pra
    # deixar uma mensagem chegar até nós.
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    app_version: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
