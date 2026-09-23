"""SQLAlchemy model for analytics events — Motor de Intenção."""
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
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


class AnalyticsProductEvent(Base):
    """First-party product analytics for Mission Control phase 1.

    Pseudonymous by design: no email, phone, names, raw IP, GPS or sensitive
    health payloads. `user_id` is derived from an authenticated JWT when
    available; anonymous/session identifiers come from the client.
    """

    __tablename__ = "analytics_product_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    event_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    event_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    anonymous_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    screen: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    route: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    occurred_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    platform: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    app_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    os: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    browser: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    device_class: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    locale: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    timezone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    properties_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Atribuição de campanha — capturada pelo cliente na 1ª tela da sessão
    # (da URL de entrada: ?utm_source=...) e reenviada em todo evento
    # "âncora de sessão" (session_start/app_open) daquela sessão. Vazio =
    # acesso direto/orgânico, não "sem dado" (ver campaign_bi.py).
    utm_source: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    utm_medium: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    utm_campaign: Mapped[Optional[str]] = mapped_column(String(160), nullable=True, index=True)
    utm_content: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    utm_term: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    # Só o HOST do referrer (nunca a URL inteira — pode carregar query string
    # de terceiro com dado que não é nosso pra guardar).
    referrer_host: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    landing_path: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Geo-IP best-effort, só nos eventos-âncora de sessão (ver
    # _enrich_product_event_geo em analytics/router.py) — mesma fonte/
    # confiabilidade do geo-IP de AppInstall, NUNCA a localização declarada
    # do tutor (User.city/state) nem a do pet. "Aproximado por IP", sempre
    # rotulado assim na UI.
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    __table_args__ = (
        Index("idx_ape_event_received", "event_name", "received_at"),
        Index("idx_ape_user_received", "user_id", "received_at"),
        Index("idx_ape_anon_received", "anonymous_id", "received_at"),
        Index("idx_ape_session_received", "session_id", "received_at"),
        Index("idx_ape_campaign_received", "utm_campaign", "received_at"),
    )
