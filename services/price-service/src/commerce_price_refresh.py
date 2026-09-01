"""Price refresh for already validated merchant offers.

This job is deliberately narrower than Shopee discovery/sync:
- it processes existing active MarketplaceOffer rows only;
- it never creates a new offer;
- it never swaps external_listing_id/SKU;
- transient API errors preserve the previous valid price;
- proven identity conflict blocks the stale offer instead of publishing a
  different SKU.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import MarketplaceOffer
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .product_identity import MerchantCandidate, ProductIdentity, evaluate_identity
from .shopee_affiliate_client import ShopeeAffiliateError, search_product_offers
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url
from .shopee_offer_matcher import _parse_price
from .shopee_offer_sync import _build_keyword_variants


@dataclass
class PriceRefreshSummary:
    merchant: str
    processed: int = 0
    refreshed: int = 0
    unchanged: int = 0
    stale: int = 0
    unavailable: int = 0
    identity_conflict: int = 0
    api_error: int = 0
    timeout: int = 0
    remaining: int = 0
    duration_seconds: float = 0.0
    errors: list[str] = field(default_factory=list)


def refresh_marketplace_prices(
    db: Session,
    *,
    merchant: str = "shopee",
    max_offers: int = 200,
    delay_seconds: float = 0.4,
    search_limit: int = 20,
) -> PriceRefreshSummary:
    """Refresh prices for existing validated marketplace offers.

    Currently only Shopee has an official productOfferV2 source wired here.
    Other marketplaces can plug in without changing product identity rules.
    """
    started = time.monotonic()
    summary = PriceRefreshSummary(merchant=merchant)
    offers = _refresh_queue(db, merchant=merchant, max_offers=max_offers)
    total_active = _active_offer_count(db, merchant)
    summary.remaining = max(total_active - len(offers), 0)

    for index, offer in enumerate(offers):
        summary.processed += 1
        try:
            if merchant != "shopee":
                _mark_error(offer, "unsupported_merchant", "sem adaptador de refresh")
                summary.api_error += 1
                continue
            _refresh_one_shopee_offer(db, offer, summary, search_limit=search_limit)
            db.commit()
        except httpx.TimeoutException as exc:
            db.rollback()
            _record_transient_error(db, offer.id, "timeout", str(exc))
            summary.timeout += 1
            summary.errors.append(_safe_error(str(exc)))
        except ShopeeAffiliateError as exc:
            db.rollback()
            _record_transient_error(db, offer.id, "api_error", str(exc))
            summary.api_error += 1
            summary.errors.append(_safe_error(str(exc)))
        except Exception as exc:  # noqa: BLE001 — um item nunca derruba a madrugada
            db.rollback()
            _record_transient_error(db, offer.id, "api_error", str(exc))
            summary.api_error += 1
            summary.errors.append(_safe_error(str(exc)))
        if delay_seconds > 0 and index < len(offers) - 1:
            time.sleep(delay_seconds)

    summary.duration_seconds = round(time.monotonic() - started, 1)
    return summary


def _refresh_one_shopee_offer(
    db: Session,
    offer: MarketplaceOffer,
    summary: PriceRefreshSummary,
    *,
    search_limit: int,
) -> None:
    product = db.get(ProductCatalog, offer.product_id)
    if product is None:
        _mark_error(offer, "unavailable", "produto canônico ausente")
        offer.is_available = False
        summary.unavailable += 1
        return
    identity = ProductIdentity.from_catalog(product)
    if not identity.gtin or not identity.canonical_name:
        _mark_error(offer, "unavailable", "identidade canônica insuficiente")
        offer.is_available = False
        summary.unavailable += 1
        return

    nodes = _search_existing_offer_candidates(identity, search_limit=search_limit)
    current = _find_current_listing(nodes, offer.external_listing_id)
    accepted_other = _has_accepted_other_listing(identity, nodes, offer.external_listing_id)
    if current is None:
        if accepted_other:
            _block_identity_conflict(offer, "merchant returned another matching SKU instead of linked listing")
            summary.identity_conflict += 1
        else:
            _mark_error(offer, "unavailable", "listing não encontrado no refresh")
            offer.is_available = False
            summary.unavailable += 1
        return

    match_result = evaluate_identity(
        identity,
        MerchantCandidate.build(
            merchant="shopee",
            title=current.get("productName") or "",
            brand=current.get("brand"),
            price=_parse_price(current.get("price")),
            external_id=str(current.get("itemId")) if current.get("itemId") is not None else None,
        ),
    )
    if not match_result.accepted:
        _block_identity_conflict(offer, ",".join(match_result.reasons) or "identity conflict")
        offer.match_decision = match_result.decision.value
        offer.match_confidence = match_result.confidence
        offer.match_reasons_json = match_result.reasons_json()
        offer.match_attributes_json = match_result.attributes_json()
        summary.identity_conflict += 1
        return

    offer_link = current.get("offerLink") or ""
    try:
        validate_shopee_affiliate_url(offer_link)
    except InvalidShopeeAffiliateUrlError:
        _mark_error(offer, "api_error", "offerLink inválido no refresh")
        summary.api_error += 1
        return

    old_price = offer.price
    new_price = _parse_price(current.get("price"))
    offer.merchant_title = current.get("productName")
    offer.price = new_price
    offer.is_available = new_price is not None
    offer.last_checked_at = datetime.now(timezone.utc)
    offer.verified_at = offer.last_checked_at
    offer.match_decision = match_result.decision.value
    offer.match_confidence = match_result.confidence
    offer.match_reasons_json = match_result.reasons_json()
    offer.match_attributes_json = match_result.attributes_json()
    offer.price_refresh_status = "refreshed"
    offer.price_refresh_error = None
    if old_price == new_price:
        summary.unchanged += 1
    else:
        summary.refreshed += 1


def _refresh_queue(db: Session, *, merchant: str, max_offers: int) -> list[MarketplaceOffer]:
    return list(db.scalars(
        select(MarketplaceOffer)
        .where(MarketplaceOffer.merchant == merchant, MarketplaceOffer.active.is_(True))
        .order_by(MarketplaceOffer.last_checked_at.is_(None).desc(), MarketplaceOffer.last_checked_at.asc())
        .limit(max(max_offers, 1))
    ))


def _active_offer_count(db: Session, merchant: str) -> int:
    return int(db.query(MarketplaceOffer.id).filter(
        MarketplaceOffer.merchant == merchant,
        MarketplaceOffer.active.is_(True),
    ).count())


def _search_existing_offer_candidates(identity: ProductIdentity, *, search_limit: int) -> list[dict]:
    product = ProductCatalog(name=identity.canonical_name, brand=identity.brand)
    keywords = [identity.gtin, *_build_keyword_variants(product, identity.weight_kg)]
    seen_keywords: set[str] = set()
    nodes_by_id: dict[str, dict] = {}
    for keyword in keywords:
        if not keyword or keyword in seen_keywords:
            continue
        seen_keywords.add(keyword)
        for node in search_product_offers(keyword, limit=search_limit):
            key = str(node.get("itemId")) if node.get("itemId") is not None else f"{node.get('productName')}:{node.get('price')}"
            nodes_by_id.setdefault(key, node)
    return list(nodes_by_id.values())


def _find_current_listing(nodes: list[dict], external_listing_id: Optional[str]) -> Optional[dict]:
    if not external_listing_id:
        return None
    for node in nodes:
        if str(node.get("itemId")) == str(external_listing_id):
            return node
    return None


def _has_accepted_other_listing(identity: ProductIdentity, nodes: list[dict], external_listing_id: Optional[str]) -> bool:
    for node in nodes:
        if external_listing_id and str(node.get("itemId")) == str(external_listing_id):
            continue
        result = evaluate_identity(
            identity,
            MerchantCandidate.build(
                merchant="shopee",
                title=node.get("productName") or "",
                brand=node.get("brand"),
                price=_parse_price(node.get("price")),
                external_id=str(node.get("itemId")) if node.get("itemId") is not None else None,
            ),
        )
        if result.accepted:
            return True
    return False


def _block_identity_conflict(offer: MarketplaceOffer, reason: str) -> None:
    offer.is_available = False
    offer.price_refresh_status = "identity_conflict"
    offer.price_refresh_error = _safe_error(reason)


def _mark_error(offer: MarketplaceOffer, status: str, error: str) -> None:
    offer.price_refresh_status = status
    offer.price_refresh_error = _safe_error(error)


def _record_transient_error(db: Session, offer_id: int, status: str, error: str) -> None:
    row = db.get(MarketplaceOffer, offer_id)
    if row is None:
        return
    row.price_refresh_status = status
    row.price_refresh_error = _safe_error(error)
    db.commit()


def _safe_error(value: str) -> str:
    return " ".join((value or "").split())[:160]
