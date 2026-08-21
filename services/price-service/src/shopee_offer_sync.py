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
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import MarketplaceOffer
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .shopee_affiliate_client import ShopeeAffiliateError, search_product_offers
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url
from .shopee_offer_matcher import _parse_price, extract_volume_ml, extract_weight_kg, find_best_match

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
    expected_volume_ml = extract_volume_ml(product.name)
    best = find_best_match(
        nodes,
        product.name,
        expected_brand=product.brand,
        expected_volume_ml=expected_volume_ml,
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


def _ensure_catalog_entry(db: Session, gtin: str, name: str, brand: Optional[str]) -> Optional[ProductCatalog]:
    """Get-or-create um products_catalog a partir de um GTIN+nome+marca já
    conhecidos de uma fonte real (ex: feed Awin/Cobasi — nunca inventado
    aqui, só passado adiante). Nunca sobrescreve nome/marca de uma linha
    já existente, não importa a origem dela (scan de tutor, outro feed,
    etc.) — só cria quando realmente não existe nada pro GTIN."""
    gtin_normalized = normalize_gtin(gtin)
    if not gtin_normalized or not name:
        return None
    existing = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    if existing:
        return existing
    product = ProductCatalog(
        barcode=gtin_normalized,
        barcode_normalized=gtin_normalized,
        name=name,
        brand=brand,
        source_primary="awin_feed",
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def sync_shopee_offer_from_feed_row(
    db: Session,
    gtin: str,
    name: str,
    brand: Optional[str],
    *,
    limit: int = 10,
    min_confidence: float = 0.5,
) -> ShopeeSyncResult:
    """Igual sync_shopee_offer_for_gtin, mas garante antes que existe uma
    linha em products_catalog pro GTIN — usado pro catálogo Awin/Cobasi
    (milhares de produtos reais, muitos nunca escaneados por nenhum
    tutor, então sem entrada prévia em products_catalog)."""
    product = _ensure_catalog_entry(db, gtin, name, brand)
    if product is None:
        return ShopeeSyncResult(gtin=gtin, matched=False, reason="GTIN ou nome inválido pra criar entrada de catálogo")
    return sync_shopee_offer_for_gtin(db, product.barcode_normalized, limit=limit, min_confidence=min_confidence)


def iter_awin_feed_products(db: Session, merchant: str = "cobasi") -> list[tuple[str, str, Optional[str]]]:
    """(gtin, title, brand) de todo produto ativo e com GTIN do feed Awin
    pro merchant dado — fonte alternativa de GTINs pro sync em massa
    (ver admin/shopee_sync_router.py, source="awin_feed"), muito mais
    ampla e limpa que products_catalog sozinho (que só tem o que algum
    tutor já escaneou)."""
    from .affiliate_feed import AffiliateFeedOffer

    rows = db.query(AffiliateFeedOffer.gtin, AffiliateFeedOffer.title, AffiliateFeedOffer.brand).filter(
        AffiliateFeedOffer.merchant == merchant,
        AffiliateFeedOffer.active.is_(True),
        AffiliateFeedOffer.gtin.isnot(None),
        AffiliateFeedOffer.title.isnot(None),
    ).all()
    return [(r[0], r[1], r[2]) for r in rows]


def sync_shopee_offers_for_gtins(
    db: Session,
    gtins: list[str],
    *,
    limit: int = 10,
    min_confidence: float = 0.5,
    delay_seconds: float = 0.4,
) -> list[ShopeeSyncResult]:
    """Roda sync_shopee_offer_for_gtin em sequência, com uma pausa entre
    chamadas (delay_seconds) — nunca validamos o comportamento da API sob
    alto volume, então isto é uma medida de prudência, não uma exigência
    documentada da Shopee. Sem pausa na última chamada (não faz sentido
    esperar depois do último GTIN)."""
    results = []
    for index, gtin in enumerate(gtins):
        results.append(sync_shopee_offer_for_gtin(db, gtin, limit=limit, min_confidence=min_confidence))
        if delay_seconds > 0 and index < len(gtins) - 1:
            time.sleep(delay_seconds)
    return results
