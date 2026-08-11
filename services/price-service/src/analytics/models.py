"""SQLAlchemy model for analytics events — Motor de Intenção."""
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class AnalyticsEvent(Base):
    """Tabela de eventos do funil de intenção.

    Não armazena PII (sem email/telefone direto).
    ip_hash é SHA-256 truncado (últimos 16 chars) — não reversível.
    """

    __tablename__ = "analytics_events"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )

    # Lead anônimo (UUID curto gerado pelo servidor)
    lead_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Origem da ação
    source: Mapped[str] = mapped_column(
        String(40), nullable=False, index=True
    )  # rg_public | home | sos | vaccines | rg_generator

    # Tipo de CTA
    cta_type: Mapped[str] = mapped_column(
        String(40), nullable=False, index=True
    )  # rg_share | rg_created | found_pet | create_rg | benefits_view | shop_redirect | doglife_redirect

    # Destino
    target: Mapped[Optional[str]] = mapped_column(
        String(60), nullable=True
    )  # petz | cobasi | petlove | internal | whatsapp

    # Natureza do link comercial de fato aberto (infra de afiliados) —
    # ausente em cliques não-comerciais. Ver docs/AFFILIATES.md.
    link_type: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )  # affiliate_product | affiliate_marketplace_offer | affiliate_store | affiliate_service | affiliate_search | direct

    # Refs opcionais (não PII)
    pet_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    rg_public_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Metadados técnicos (sem PII)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # SHA-256[:16]

    # Metadados extras (JSON livre, sem PII)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    __table_args__ = (
        Index("idx_ae_source_cta", "source", "cta_type"),
        Index("idx_ae_cta_date", "cta_type", "created_at"),
        Index("idx_ae_lead", "lead_id"),
    )
