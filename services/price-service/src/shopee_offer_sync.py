"""
Sincroniza MarketplaceOffer (merchant="shopee") a partir de busca por
palavra-chave na Shopee Affiliate API, produto a produto — nunca em massa
pro catálogo inteiro sozinho (busca por palavra-chave tem custo de rede E
risco de casamento errado por produto, diferente do feed em lote da
Awin/Cobasi, que casa por GTIN exato). Chamador decide a lista de GTINs
(ex: os produtos mais recomprados, ou uma lista passada manualmente).

Roda em lote (scripts/sync_shopee_offers.py), nunca no caminho de
requisição do tutor — MarketplaceOfferProvider (marketplace_offer_provider.py)
só lê o resultado já sincronizado.

Só grava (upsert) quando shopee_offer_matcher acha um candidato confiável
pro peso/marca esperados — nunca publica "o menos pior" resultado de
busca (ver shopee_offer_matcher.py pro porquê disso ser obrigatório).
Nunca desativa uma oferta existente só por não achar candidato confiável
nesta execução — uma falha transitória de busca não deve apagar uma oferta
boa; desativar continua sendo ação manual via admin
(admin/marketplace_offers_router.py).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import MarketplaceOffer
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .shopee_affiliate_client import ShopeeAffiliateError, search_product_offers
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url
from .shopee_offer_matcher import extract_weight_kg, find_best_match

logger = logging.getLogger(__name__)


@dataclass
class ShopeeSyncResult:
    gtin: str
    matched: bool
    reason: str = ""
    offer_id: Optional[int] = None


def _build_keyword(product: ProductCatalog) -> str:
    parts = [p for p in (product.brand, product.name) if p]
    return " ".join(parts).strip()


def _parse_price(raw: object) -> Optional[float]:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def sync_shopee_offer_for_gtin(
    db: Session,
    gtin: str,
    *,
    limit: int = 10,
    min_confidence: float = 0.5,
) -> ShopeeSyncResult:
    """Busca, casa e faz upsert de UMA oferta Shopee pro produto do GTIN
    dado. Idempotente: reexecutar atualiza a mesma linha (chave:
    product_id + merchant + external_listing_id), nunca duplica."""
    gtin_normalized = normalize_gtin(gtin)
    if not gtin_normalized:
        return ShopeeSyncResult(gtin=gtin, matched=False, reason="GTIN inválido")

    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    if not product:
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason="produto não encontrado em products_catalog")
    if not product.name:
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason="produto sem nome cadastrado — não dá pra buscar/casar")

    keyword = _build_keyword(product)
    try:
        nodes = search_product_offers(keyword, limit=limit)
    except ShopeeAffiliateError as exc:
        logger.warning("shopee sync: erro na busca para gtin=%s: %s", gtin_normalized, exc)
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason=f"erro na API Shopee: {exc}")

    expected_weight_kg = extract_weight_kg(product.name)
    best = find_best_match(
        nodes,
        product.name,
        expected_brand=product.brand,
        expected_weight_kg=expected_weight_kg,
        min_confidence=min_confidence,
    )
    if best is None:
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason="nenhum candidato confiável na busca")

    offer_link = best.get("offerLink") or ""
    try:
        validate_shopee_affiliate_url(offer_link)
    except InvalidShopeeAffiliateUrlError as exc:
        logger.warning("shopee sync: offerLink inválido para gtin=%s: %s", gtin_normalized, exc)
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason=f"offerLink inválido: {exc}")

    price = _parse_price(best.get("price"))
    external_listing_id = str(best.get("itemId")) if best.get("itemId") is not None else None
    now = datetime.now(timezone.utc)

    existing = db.scalar(
        select(MarketplaceOffer).where(
            MarketplaceOffer.product_id == product.id,
            MarketplaceOffer.merchant == "shopee",
            MarketplaceOffer.external_listing_id == external_listing_id,
        )
    )
    if existing:
        existing.affiliate_url = offer_link
        existing.direct_url = best.get("productLink")
        existing.seller_name = best.get("shopName")
        existing.price = price
        existing.is_available = True
        existing.active = True
        existing.verified_at = now
        existing.last_checked_at = now
        offer = existing
    else:
        offer = MarketplaceOffer(
            product_id=product.id,
            merchant="shopee",
            external_listing_id=external_listing_id,
            seller_name=best.get("shopName"),
            affiliate_url=offer_link,
            direct_url=best.get("productLink"),
            price=price,
            is_available=True,
            active=True,
            verified_at=now,
            last_checked_at=now,
        )
        db.add(offer)

    db.commit()
    db.refresh(offer)
    return ShopeeSyncResult(gtin=gtin_normalized, matched=True, offer_id=offer.id)


def sync_shopee_offers_for_gtins(
    db: Session,
    gtins: list[str],
    *,
    limit: int = 10,
    min_confidence: float = 0.5,
) -> list[ShopeeSyncResult]:
    return [
        sync_shopee_offer_for_gtin(db, gtin, limit=limit, min_confidence=min_confidence)
        for gtin in gtins
    ]
