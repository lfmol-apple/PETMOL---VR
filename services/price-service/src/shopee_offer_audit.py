"""Auditoria de identidade de ofertas Shopee já gravadas.

Objetivo: uma oferta marketplace antiga nunca pode sobreviver só porque
foi casada antes de uma regra mais rigorosa existir. Este módulo reexecuta
a busca oficial da Shopee para o GTIN/descrição/marca/peso conhecidos e
desativa a oferta atual se o listing salvo não voltar como match confiável.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
from typing import Callable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .affiliate_links import MarketplaceOffer
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .shopee_affiliate_client import ShopeeAffiliateError, search_product_offers
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url
from .shopee_offer_matcher import extract_length_cm, extract_volume_ml, extract_weight_kg
from .shopee_offer_sync import (
    _brand_for_matching,
    _build_keyword_variants,
    _confident_matches,
    _parse_price,
    _best_feed_row,
)

logger = logging.getLogger(__name__)

DEFAULT_AUDIT_MERCHANTS = ("cobasi", "zeenow", "zeedog")


@dataclass
class ShopeeOfferAuditItem:
    offer_id: int
    product_id: int
    gtin: str
    external_listing_id: Optional[str]
    expected_title: str
    expected_brand: Optional[str]
    expected_weight_kg: Optional[float]
    expected_volume_ml: Optional[float]
    expected_length_cm: Optional[float]
    decision: str
    reason: str
    candidate_count: int = 0
    matched_listing_ids: list[str] = field(default_factory=list)
    matched_titles: list[str] = field(default_factory=list)


@dataclass
class ShopeeOfferAuditResult:
    total: int = 0
    valid: int = 0
    invalid: int = 0
    deactivated: int = 0
    errors: int = 0
    items: list[ShopeeOfferAuditItem] = field(default_factory=list)


def audit_active_shopee_offers(
    db: Session,
    *,
    source_merchants: tuple[str, ...] = DEFAULT_AUDIT_MERCHANTS,
    deactivate_invalid: bool = True,
    limit: int = 20,
    min_confidence: float = 0.5,
    max_rows: Optional[int] = None,
    progress_callback: Optional[Callable[[int, ShopeeOfferAuditResult], None]] = None,
) -> ShopeeOfferAuditResult:
    rows = list(db.execute(
        select(MarketplaceOffer, ProductCatalog)
        .join(ProductCatalog, ProductCatalog.id == MarketplaceOffer.product_id)
        .where(
            MarketplaceOffer.merchant == "shopee",
            MarketplaceOffer.active.is_(True),
        )
        .order_by(MarketplaceOffer.updated_at.asc(), MarketplaceOffer.id.asc())
    ))
    if max_rows is not None:
        rows = rows[:max_rows]

    result = ShopeeOfferAuditResult(total=len(rows))
    now = datetime.now(timezone.utc)
    if progress_callback:
        progress_callback(0, result)

    for index, (offer, product) in enumerate(rows, start=1):
        item = _audit_one_offer(
            db,
            offer,
            product,
            source_merchants=source_merchants,
            limit=limit,
            min_confidence=min_confidence,
        )
        result.items.append(item)
        if item.decision == "valid":
            result.valid += 1
        elif item.decision == "invalid":
            result.invalid += 1
            if deactivate_invalid:
                offer.active = False
                offer.last_checked_at = now
                result.deactivated += 1
        else:
            result.errors += 1
        if progress_callback:
            progress_callback(index, result)

    db.commit()
    logger.info(
        "[shopee_offer_audit] total=%s valid=%s invalid=%s deactivated=%s errors=%s",
        result.total,
        result.valid,
        result.invalid,
        result.deactivated,
        result.errors,
    )
    for item in result.items[:20]:
        logger.info(
            "[shopee_offer_audit] decision=%s reason=%s gtin=%s offer_id=%s listing=%s expected=%r brand=%r weight=%s volume=%s length_cm=%s matches=%s",
            item.decision,
            item.reason,
            item.gtin,
            item.offer_id,
            item.external_listing_id,
            item.expected_title,
            item.expected_brand,
            item.expected_weight_kg,
            item.expected_volume_ml,
            item.expected_length_cm,
            item.matched_listing_ids,
        )
    return result


def _audit_one_offer(
    db: Session,
    offer: MarketplaceOffer,
    product: ProductCatalog,
    *,
    source_merchants: tuple[str, ...],
    limit: int,
    min_confidence: float,
) -> ShopeeOfferAuditItem:
    gtin = normalize_gtin(product.barcode_normalized or product.barcode or "")
    expected_title, expected_brand = _expected_identity(db, product, gtin, source_merchants)
    expected_weight_kg = extract_weight_kg(expected_title)
    expected_volume_ml = extract_volume_ml(expected_title)
    expected_length_cm = extract_length_cm(expected_title)

    base = ShopeeOfferAuditItem(
        offer_id=offer.id,
        product_id=product.id,
        gtin=gtin or "",
        external_listing_id=offer.external_listing_id,
        expected_title=expected_title,
        expected_brand=expected_brand,
        expected_weight_kg=expected_weight_kg,
        expected_volume_ml=expected_volume_ml,
        expected_length_cm=expected_length_cm,
        decision="error",
        reason="not_evaluated",
    )
    if not gtin or not expected_title or not offer.external_listing_id:
        base.decision = "invalid"
        base.reason = "missing_gtin_title_or_listing_id"
        return base

    nodes_by_id: dict[str, dict] = {}
    keyword_product = ProductCatalog(name=expected_title, brand=expected_brand)
    try:
        for keyword in _build_keyword_variants(keyword_product, expected_weight_kg):
            for node in search_product_offers(keyword, limit=limit):
                listing_id = str(node.get("itemId")) if node.get("itemId") is not None else ""
                if listing_id:
                    nodes_by_id.setdefault(listing_id, node)
    except ShopeeAffiliateError as exc:
        base.reason = f"shopee_api_error:{exc}"
        return base

    match_brand = _brand_for_matching(expected_title, expected_brand)
    matches = _confident_matches(
        list(nodes_by_id.values()),
        expected_title,
        expected_brand=match_brand,
        expected_weight_kg=expected_weight_kg,
        expected_volume_ml=expected_volume_ml,
        expected_length_cm=expected_length_cm,
        min_confidence=min_confidence,
    )
    matched_ids = [str(node.get("itemId")) for node in matches if node.get("itemId") is not None]
    base.candidate_count = len(nodes_by_id)
    base.matched_listing_ids = matched_ids
    base.matched_titles = [(node.get("productName") or "")[:180] for node in matches[:5]]

    if str(offer.external_listing_id) not in set(matched_ids):
        base.decision = "invalid"
        base.reason = "saved_listing_not_in_confident_matches"
        return base

    matched_node = next((node for node in matches if str(node.get("itemId")) == str(offer.external_listing_id)), None)
    if matched_node is not None:
        offer_link = matched_node.get("offerLink") or ""
        try:
            validate_shopee_affiliate_url(offer_link)
        except InvalidShopeeAffiliateUrlError:
            base.decision = "invalid"
            base.reason = "matched_listing_has_invalid_affiliate_url"
            return base
        offer.affiliate_url = offer_link
        offer.direct_url = matched_node.get("productLink")
        offer.seller_name = matched_node.get("shopName")
        offer.price = _parse_price(matched_node.get("price"))
        offer.is_available = True
        offer.verified_at = datetime.now(timezone.utc)
        offer.last_checked_at = offer.verified_at

    base.decision = "valid"
    base.reason = "saved_listing_revalidated"
    return base


def _expected_identity(
    db: Session,
    product: ProductCatalog,
    gtin: str,
    source_merchants: tuple[str, ...],
) -> tuple[str, Optional[str]]:
    feed_rows = list(db.scalars(
        select(AffiliateFeedOffer).where(
            AffiliateFeedOffer.merchant.in_(source_merchants),
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.in_stock.is_(True),
            AffiliateFeedOffer.gtin == gtin,
            AffiliateFeedOffer.title.isnot(None),
        )
    ))
    if feed_rows:
        _gtin, title, brand = _best_feed_row(feed_rows)
        return title or product.name or "", brand or product.brand
    return product.name or "", product.brand
