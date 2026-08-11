"""
Links de afiliado por produto — infraestrutura comercial/afiliados.

Um GTIN/apresentação pode ter, por merchant, um deep link afiliado
específico (ex: gerado no painel Cobasi MAIS). Isso é dado comercial
dinâmico e por isso fica no banco, não em env var/build do frontend —
ativar/desativar um link não deve exigir deploy de frontend.

Regra de exibição (ver docs/AFFILIATES.md): uma oferta de produto só é
"monetizável" quando existe ProductAffiliateLink ativo para aquele
product_id+merchant. Sem isso, o merchant fica invisível para aquele
produto — nunca cai para link comum sem comissão.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlsplit

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base

# Storefronts afiliadas fixas (navegação geral, não por produto) — URLs
# públicas confirmadas, nunca modificadas/geradas dinamicamente. Ver
# docs/AFFILIATES.md. Deve espelhar o mesmo valor usado em
# apps/web/src/features/commerce/homeShoppingPartners.ts para a Cobasi.
STOREFRONT_AFFILIATE_URLS: dict[str, str] = {
    "cobasi": "https://minhaloja.cobasi.com.br?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol",
}

_BLOCKED_SCHEMES = {"javascript", "data", "file"}


class InvalidAffiliateUrlError(ValueError):
    pass


def validate_affiliate_url(url: str) -> None:
    """HTTPS obrigatório; bloqueia javascript:/data:/file: e estrutura inválida."""
    if not url or not url.strip():
        raise InvalidAffiliateUrlError("URL vazia")
    parts = urlsplit(url.strip())
    scheme = (parts.scheme or "").lower()
    if scheme in _BLOCKED_SCHEMES:
        raise InvalidAffiliateUrlError(f"Esquema de URL não permitido: {scheme}:")
    if scheme != "https":
        raise InvalidAffiliateUrlError("URL deve ser https://")
    if not parts.netloc:
        raise InvalidAffiliateUrlError("URL inválida (sem host)")


class ProductAffiliateLink(Base):
    """Deep link afiliado de um produto (products_catalog) para um merchant."""

    __tablename__ = "product_affiliate_links"
    __table_args__ = (UniqueConstraint("product_id", "merchant", name="uq_affiliate_link_product_merchant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products_catalog.id"), nullable=False, index=True)
    merchant: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    affiliate_product_url: Mapped[str] = mapped_column(Text, nullable=False)
    direct_product_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    affiliate_program: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


def get_active_link(db: Session, product_id: int, merchant: str) -> Optional[ProductAffiliateLink]:
    return db.scalar(
        select(ProductAffiliateLink).where(
            ProductAffiliateLink.product_id == product_id,
            ProductAffiliateLink.merchant == merchant,
            ProductAffiliateLink.active.is_(True),
        )
    )


class MarketplaceOffer(Base):
    """Oferta/publicação de um vendedor em um marketplace (Shopee, ML) para
    um produto — NÃO é o mesmo conceito que ProductAffiliateLink.

    Diferença deliberada: um retailer (Cobasi) tem UM deep link estável por
    produto+merchant (por isso o UniqueConstraint em ProductAffiliateLink);
    um marketplace pode ter VÁRIAS ofertas concorrentes para o mesmo produto
    (vendedores diferentes) e cada uma pode expirar/mudar de preço/sumir de
    estoque sem que o produto PETMOL deixe de existir — por isso não há
    UniqueConstraint(product_id, merchant) aqui.

    Nenhuma integração real popula esta tabela ainda (Shopee/ML não estão
    ativos — ver docs/AFFILIATES.md). Existe apenas para a arquitetura já
    suportar o conceito quando os programas forem aprovados, sem precisar
    de crawler/job/fila nesta tarefa.
    """

    __tablename__ = "marketplace_offers"
    __table_args__ = (Index("ix_marketplace_offers_product_merchant", "product_id", "merchant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products_catalog.id"), nullable=False, index=True)
    merchant: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    external_listing_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    seller_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    affiliate_url: Mapped[str] = mapped_column(Text, nullable=False)
    direct_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_available: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


def get_active_marketplace_offer(db: Session, product_id: int, merchant: str) -> Optional[MarketplaceOffer]:
    """Melhor oferta ativa (menor preço primeiro; sem preço, a mais recente)."""
    return db.scalar(
        select(MarketplaceOffer)
        .where(
            MarketplaceOffer.product_id == product_id,
            MarketplaceOffer.merchant == merchant,
            MarketplaceOffer.active.is_(True),
        )
        .order_by(MarketplaceOffer.price.is_(None), MarketplaceOffer.price.asc(), MarketplaceOffer.verified_at.desc())
    )


def get_monetized_offer(
    db: Session,
    merchant: str,
    context: str = "product",
    product_id: Optional[int] = None,
) -> Optional[dict]:
    """Implementa a ordem de resolução comercial (ver docs/AFFILIATES.md):

    context="product": só retorna oferta se existir deep link ativo daquele
    produto específico — nunca cai para a storefront genérica (recompra de
    um produto não deve mandar o tutor procurar de novo numa loja genérica).

    context="store": só retorna a storefront afiliada fixa do merchant,
    quando existir — usada na área geral "Lojas", sem produto específico.

    context="marketplace": só retorna oferta se existir MarketplaceOffer
    ativa daquele produto+merchant. Diferente de "product": a oferta é uma
    publicação/vendedor que pode expirar sem afetar o produto PETMOL (ver
    MarketplaceOffer). Nenhum merchant popula isso ainda — Shopee/ML não
    integrados nesta tarefa (ver docs/AFFILIATES.md).
    """
    if context == "product":
        if product_id is None:
            return None
        link = get_active_link(db, product_id, merchant)
        if not link:
            return None
        return {"merchant": merchant, "url": link.affiliate_product_url, "link_type": "affiliate_product"}

    if context == "store":
        url = STOREFRONT_AFFILIATE_URLS.get(merchant)
        if not url:
            return None
        return {"merchant": merchant, "url": url, "link_type": "affiliate_store"}

    if context == "marketplace":
        if product_id is None:
            return None
        offer = get_active_marketplace_offer(db, product_id, merchant)
        if not offer:
            return None
        return {"merchant": merchant, "url": offer.affiliate_url, "link_type": "affiliate_marketplace_offer"}

    return None
