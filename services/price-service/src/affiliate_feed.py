"""
AffiliateFeedOffer — oferta comercial normalizada vinda de um feed de rede
de afiliados (Awin hoje; outras redes futuramente). Ver docs/AFFILIATES.md.

Princípio (não confundir camadas — ver commerce_provider.py):
  - products_catalog       : identidade do produto conhecida pelo PETMOL (GTIN).
  - AffiliateFeedOffer      : oferta comercial EXTERNA de uma rede/merchant.
  - Awin é REDE (network), não merchant — "merchant" aqui é cobasi/zeenow/
    zeedog/petz etc; "network" é awin (ou outra rede futura).

Um mesmo GTIN pode ter várias linhas aqui (Cobasi via Awin, Zee Now via
Awin, Zee Dog via Awin, futuramente outras redes) — cada uma é uma oferta
concorrente, resolvida pelo CommerceEngine/dedupe, nunca uma identidade de
produto.

Fica no Postgres principal — NÃO um SQLite separado (ver feeds/database.py,
legado/órfão, não usado por nada em produção; ver §25 do doc de
arquitetura interno).

Cobasi (advertiser 17870) aprovada e sincronizada desde 13/08/2026 — ver
awin_feed_sync.py e docs/AFFILIATES.md. `enabled=True` técnico no
merchant não implica exposição pública: o master gate
(config.awin_enabled/awin_shadow_mode, ver awin_advertisers.py
is_awin_merchant_publicly_servable) decide se uma linha daqui pode virar
link clicável pro tutor.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class AffiliateFeedOffer(Base):
    """Uma linha = uma oferta de produto vinda de um feed de afiliados
    (ex: uma linha do feed XML/CSV da Awin para o Cobasi)."""

    __tablename__ = "affiliate_feed_offers"
    __table_args__ = (
        UniqueConstraint(
            "network", "advertiser_id", "external_product_id",
            name="uq_affiliate_feed_offer_network_advertiser_product",
        ),
        Index("ix_affiliate_feed_offers_merchant", "merchant"),
        Index("ix_affiliate_feed_offers_gtin", "gtin"),
        Index("ix_affiliate_feed_offers_merchant_gtin", "merchant", "gtin"),
        Index("ix_affiliate_feed_offers_active", "active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Identidade da oferta na rede ────────────────────────────────────
    network: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # "awin"
    merchant: Mapped[str] = mapped_column(String(32), nullable=False)  # "cobasi" | "zeenow" | "zeedog" | "petz"
    advertiser_id: Mapped[str] = mapped_column(String(32), nullable=False)
    external_product_id: Mapped[str] = mapped_column(String(128), nullable=False)
    sku: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    # ── Correspondência com a identidade PETMOL ─────────────────────────
    gtin: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # ── Dados do produto (normalizados, pequenos — nunca imagem/HTML) ───
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ── Oferta comercial ─────────────────────────────────────────────────
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    list_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="BRL")
    in_stock: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    stock_quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # ── URLs — apenas referência externa, nunca ativo baixado ───────────
    merchant_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    affiliate_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Controle de sincronização ────────────────────────────────────────
    source_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AffiliateFeedSyncRun(Base):
    """Uma linha = uma execução de awin_feed_sync.py pra um merchant —
    histórico/observabilidade do job de sincronização (ver §11 do doc de
    arquitetura interno). NUNCA guarda o feed bruto/CSV/gzip/token/payload
    — só contadores e um erro curto e sanitizado (nunca a URL com a chave
    de API embutida).

    status:
      "running"       — em andamento (lock: outra sync do mesmo merchant
                         não pode começar enquanto existir uma "running"
                         sem finished_at — ver sync_awin_feed()).
      "success"       — completou e o catálogo foi atualizado normalmente.
      "empty_feed"    — feed baixou mas veio com 0 linhas; tratado como
                         falha de propósito (nunca desativa o catálogo
                         anterior só por isso — ver §11).
      "failed"        — download/parse falhou antes de qualquer upsert.
    """

    __tablename__ = "affiliate_feed_sync_runs"
    __table_args__ = (
        Index("ix_affiliate_feed_sync_runs_merchant", "merchant"),
        Index("ix_affiliate_feed_sync_runs_merchant_status", "merchant", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    network: Mapped[str] = mapped_column(String(32), nullable=False)
    merchant: Mapped[str] = mapped_column(String(32), nullable=False)
    advertiser_id: Mapped[str] = mapped_column(String(32), nullable=False)
    feed_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")

    rows_seen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_upserted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_deactivated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_with_gtin: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_with_affiliate_url: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_in_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_gtin_corrected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_gtin_invalid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_gtin_groups: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ambiguous_gtin_groups: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Curto e sanitizado de propósito — nunca stack trace inteiro, nunca URL
    # (que contém a datafeed key). Ver _sanitize_error em awin_feed_sync.py.
    error_message: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
